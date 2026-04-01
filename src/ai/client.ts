/**
 * AI 客户端适配层模块
 * 负责与 AI 服务商（如 OpenRouter）进行结构化交互。
 * 包含：AI SDK 初始化、任务配置解析、Dummy Provider 模拟、结构化输出校验及错误处理。
 */

import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import type { ZodType } from "zod";

import { type AppEnv, getAppEnv } from "../config";
import { type AiPromptInput, type AiPromptVersion, type EnabledAiRuntimeState, getPromptDefinition } from "./prompts";
import type { BasicAnalysis, HeavySummary } from "./schemas";

/** AI 运行时状态联合类型 */
type AiRuntimeState = "disabled" | EnabledAiRuntimeState;
/** AI 任务种类 */
type AiTaskKind = "basic" | "heavy";
/** AI 客户端所需的配置子集 */
type AiClientEnv = Pick<
  AppEnv,
  "aiBasicModel" | "aiHeavyModel" | "aiProvider" | "openRouterApiKey" | "openRouterBaseUrl"
>;

/** 结构化对象生成函数类型 */
type GenerateStructuredObject = <TOutput>(input: {
  model: unknown;
  prompt: string;
  schema: ZodType<TOutput>;
  schemaDescription: string;
  schemaName: string;
  system: string;
}) => Promise<{ object: TOutput }>;

/** OpenRouter 服务商工厂函数类型 */
type OpenRouterProviderFactory = (config: { apiKey: string; baseURL: string; name: "openrouter" }) => {
  chat: (modelId: string) => unknown;
};

/** 解析后的 AI 任务配置结构 */
type ResolvedAiTaskConfig = {
  /** AI API 基础地址 */
  baseURL: string | null;
  /** 具体使用的模型 ID (如 gpt-4o-mini) */
  modelId: string | null;
  /** 模型策略名称，用于持久化去重判断 */
  modelStrategy: string | null;
  /** 使用的 Prompt 版本 */
  promptVersion: AiPromptVersion;
  /** 当前运行时状态 */
  runtimeState: AiRuntimeState;
};

type AiClientDeps = {
  env?: AiClientEnv;
  generateStructuredObject?: GenerateStructuredObject;
  openRouterProviderFactory?: OpenRouterProviderFactory;
};

/** 结构化 Prompt 定义结构 */
type StructuredPromptDefinition<TOutput> = {
  buildMessages: (input: AiPromptInput) => {
    prompt: string;
    system: string;
  };
  schema: ZodType<TOutput>;
  schemaDescription: string;
  schemaName: string;
};

// --- 错误定义 ---

/** AI 提供商未配置错误 */
class AiProviderUnavailableError extends Error {
  readonly code = "AI_PROVIDER_UNAVAILABLE";

  constructor(
    message = "[ai/client] AI provider is not configured. Set SMART_FEED_AI_PROVIDER before running AI stages.",
  ) {
    super(message);
    this.name = "AiProviderUnavailableError";
  }
}

/** AI 配置无效错误（如缺少模型 ID） */
class AiConfigurationError extends Error {
  readonly code = "AI_CONFIGURATION_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "AiConfigurationError";
  }
}

// --- 默认实现 ---

/** 使用 Vercel AI SDK 的 generateObject 实现结构化输出 */
const defaultGenerateStructuredObject: GenerateStructuredObject = async ({
  model,
  prompt,
  schema,
  schemaDescription,
  schemaName,
  system,
}) => {
  const result = await generateObject({
    model: model as Parameters<typeof generateObject>[0]["model"],
    prompt,
    schema,
    schemaDescription,
    schemaName,
    system,
  });

  return {
    object: result.object,
  };
};

/** 默认的 OpenRouter 兼容层实现 */
const defaultOpenRouterProviderFactory: OpenRouterProviderFactory = (config) =>
  createOpenAI(config) as unknown as ReturnType<OpenRouterProviderFactory>;

// --- Dummy Provider 辅助逻辑 (启发式模拟 AI) ---

/** 提取文本片段用于 Dummy 输出 */
function collectCandidatePhrases(input: AiPromptInput): string[] {
  const normalized = `${input.title}\n${input.cleanedMd}`
    .replace(/[#>*_`~-]+/g, " ")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length === 0) {
    return [input.title];
  }

  const phrases = normalized
    .split(/[。！？.!?\n]/u)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= 6);

  return phrases.length > 0 ? phrases : [normalized.slice(0, 160)];
}

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

/** 启发式：推断语种 */
function inferLanguage(text: string): BasicAnalysis["language"] {
  return /[\u4e00-\u9fff]/u.test(text) ? "zh" : "en";
}

/** 启发式：推断分类 */
function inferCategories(text: string): BasicAnalysis["categories"] {
  const categories = new Set<string>();
  const normalized = text.toLowerCase();

  if (/[aA][iI]|模型|agent|llm|智能/u.test(text)) {
    categories.add("ai");
  }

  if (/database|postgres|sql|drizzle|redis/u.test(normalized)) {
    categories.add("data");
  }

  if (/release|launch|ship|发布|上线|roadmap/u.test(text)) {
    categories.add("product");
  }

  if (/security|漏洞|风控|风险|合规/u.test(text)) {
    categories.add("risk");
  }

  if (categories.size === 0) {
    categories.add("general");
  }

  return Array.from(categories).slice(0, 4);
}

/** 启发式：推断关键词 */
function inferKeywords(text: string): string[] {
  const englishTokens = Array.from(text.toLowerCase().matchAll(/\b[a-z][a-z0-9-]{3,}\b/g), (match) => match[0]);
  const chineseTokens = Array.from(text.matchAll(/[\u4e00-\u9fff]{2,6}/gu), (match) => match[0]);
  const keywords = [...englishTokens, ...chineseTokens]
    .map((token) => token.trim())
    .filter((token, index, list) => list.indexOf(token) === index);

  return keywords.slice(0, 8);
}

/** 启发式：推断实体 */
function inferEntities(input: AiPromptInput): string[] {
  const entities = new Set<string>([input.sourceName]);

  for (const match of input.cleanedMd.matchAll(/\b[A-Z][A-Za-z0-9-]{2,}\b/g)) {
    entities.add(match[0]);
  }

  return Array.from(entities).slice(0, 6);
}

/** 启发式：推断情感 */
function inferSentiment(text: string): BasicAnalysis["sentiment"] {
  const positivePattern = /improve|growth|突破|增长|提升|机会/u;
  const negativePattern = /risk|issue|fail|warning|下降|风险|故障/u;
  const hasPositive = positivePattern.test(text);
  const hasNegative = negativePattern.test(text);

  if (hasPositive && hasNegative) {
    return "mixed";
  }

  if (hasPositive) {
    return "positive";
  }

  if (hasNegative) {
    return "negative";
  }

  return "neutral";
}

/** 启发式：推断价值分 */
function inferValueScore(text: string, categories: string[]): number {
  let score = 4;
  const contentLength = text.trim().length;

  if (contentLength > 400) {
    score += 1;
  }

  if (contentLength > 1200) {
    score += 1;
  }

  if (categories.includes("ai") || categories.includes("product")) {
    score += 1;
  }

  if (/analysis|benchmark|总结|复盘|趋势|架构/u.test(text)) {
    score += 1;
  }

  return Math.max(0, Math.min(10, score));
}

/** 构建 Dummy 模式下的基础分析结果 */
function buildDummyBasicAnalysis(input: AiPromptInput): BasicAnalysis {
  const combinedText = `${input.title}\n${input.cleanedMd}`;
  const categories = inferCategories(combinedText);
  const keywords = inferKeywords(combinedText);
  const entities = inferEntities(input);

  return {
    categories,
    entities,
    keywords,
    language: inferLanguage(combinedText),
    sentiment: inferSentiment(combinedText),
    valueScore: inferValueScore(combinedText, categories),
  };
}

/** 构建 Dummy 模式下的深度摘要结果 */
function buildDummyHeavySummary(input: AiPromptInput): HeavySummary {
  const phrases = collectCandidatePhrases(input);
  const evidenceSnippet = truncateText(phrases[0] ?? input.title, 180);
  const points = phrases.slice(0, 3).map((phrase) => truncateText(phrase, 90));
  const categories = inferCategories(`${input.title}\n${input.cleanedMd}`);
  const valueScore = inferValueScore(`${input.title}\n${input.cleanedMd}`, categories);

  return {
    evidenceSnippet,
    oneline: truncateText(`${input.sourceName}：${input.title}`, 70),
    points,
    reason: `Dummy provider 认为这篇内容的价值分约为 ${valueScore}/10，适合后续由真实模型接管验证。`,
  };
}

// --- 配置解析逻辑 ---

function resolveModelId(kind: AiTaskKind, env: AiClientEnv): string {
  const modelId = kind === "basic" ? env.aiBasicModel : env.aiHeavyModel;

  if (modelId === null) {
    const envKey = kind === "basic" ? "SMART_FEED_AI_BASIC_MODEL" : "SMART_FEED_AI_HEAVY_MODEL";
    throw new AiConfigurationError(`[ai/client] SMART_FEED_AI_PROVIDER=openrouter requires ${envKey}.`);
  }

  return modelId;
}

function resolveOpenRouterApiKey(env: AiClientEnv): string {
  if (env.openRouterApiKey === null) {
    throw new AiConfigurationError("[ai/client] SMART_FEED_AI_PROVIDER=openrouter requires OPENROUTER_API_KEY.");
  }

  return env.openRouterApiKey;
}

function getRuntimeStateFromEnv(env: AiClientEnv): AiRuntimeState {
  return env.aiProvider ?? "disabled";
}

/**
 * 将环境变量和任务类型解析为最终的 AI 任务配置
 */
function resolveTaskConfig(kind: AiTaskKind, env: AiClientEnv): ResolvedAiTaskConfig {
  const promptDefinition =
    kind === "basic" ? getPromptDefinition("basic-analysis-v1") : getPromptDefinition("heavy-summary-v1");
  const promptVersion = promptDefinition.promptVersion;
  const runtimeState = getRuntimeStateFromEnv(env);

  if (runtimeState === "disabled") {
    return { baseURL: null, modelId: null, modelStrategy: null, promptVersion, runtimeState };
  }

  if (runtimeState === "dummy") {
    return {
      baseURL: null,
      modelId: "dummy",
      modelStrategy: promptDefinition.getModelStrategy(runtimeState),
      promptVersion,
      runtimeState,
    };
  }

  // 校验 API Key
  resolveOpenRouterApiKey(env);

  return {
    baseURL: env.openRouterBaseUrl,
    modelId: resolveModelId(kind, env),
    modelStrategy: promptDefinition.getModelStrategy(runtimeState),
    promptVersion,
    runtimeState,
  };
}

/**
 * AI 客户端工厂
 */
function createAiClient(deps: AiClientDeps = {}) {
  const env = deps.env ?? getAppEnv();
  const generateStructuredObject = deps.generateStructuredObject ?? defaultGenerateStructuredObject;
  const openRouterProviderFactory = deps.openRouterProviderFactory ?? defaultOpenRouterProviderFactory;
  let cachedOpenRouterProvider: ReturnType<OpenRouterProviderFactory> | null = null;

  function getAiRuntimeState(): AiRuntimeState {
    return getRuntimeStateFromEnv(env);
  }

  function assertAiAvailable(): EnabledAiRuntimeState {
    const runtimeState = getAiRuntimeState();

    if (runtimeState === "disabled") {
      throw new AiProviderUnavailableError();
    }

    return runtimeState;
  }

  function getOpenRouterProvider(): ReturnType<OpenRouterProviderFactory> {
    cachedOpenRouterProvider ??= openRouterProviderFactory({
      apiKey: resolveOpenRouterApiKey(env),
      baseURL: env.openRouterBaseUrl,
      name: "openrouter",
    });

    return cachedOpenRouterProvider;
  }

  /** 通用的结构化 Prompt 运行流程 */
  async function runStructuredPrompt<TOutput>(options: {
    buildDummyOutput: (input: AiPromptInput) => TOutput;
    input: AiPromptInput;
    kind: AiTaskKind;
    promptDefinition: StructuredPromptDefinition<TOutput>;
  }): Promise<TOutput> {
    const { buildDummyOutput, input, kind, promptDefinition } = options;
    const runtimeState = assertAiAvailable();

    // 如果是 Dummy 模式，直接基于规则生成假数据并校验
    if (runtimeState === "dummy") {
      return promptDefinition.schema.parse(buildDummyOutput(input));
    }

    // 否则调用真实 AI 模型
    const provider = getOpenRouterProvider();
    const messages = promptDefinition.buildMessages(input);
    const result = await generateStructuredObject({
      model: provider.chat(resolveModelId(kind, env)),
      prompt: messages.prompt,
      schema: promptDefinition.schema,
      schemaDescription: promptDefinition.schemaDescription,
      schemaName: promptDefinition.schemaName,
      system: messages.system,
    });

    return promptDefinition.schema.parse(result.object);
  }

  return {
    assertAiAvailable,
    getAiRuntimeState,
    resolveAiTaskConfig(kind: AiTaskKind): ResolvedAiTaskConfig {
      return resolveTaskConfig(kind, env);
    },
    /** 执行基础分析 */
    async runBasicAnalysis(input: AiPromptInput): Promise<BasicAnalysis> {
      return runStructuredPrompt({
        buildDummyOutput: buildDummyBasicAnalysis,
        input,
        kind: "basic",
        promptDefinition: getPromptDefinition("basic-analysis-v1"),
      });
    },
    /** 执行深度摘要 */
    async runHeavySummary(input: AiPromptInput): Promise<HeavySummary> {
      return runStructuredPrompt({
        buildDummyOutput: buildDummyHeavySummary,
        input,
        kind: "heavy",
        promptDefinition: getPromptDefinition("heavy-summary-v1"),
      });
    },
  };
}

/** 导出的单例客户端 */
const aiClient = createAiClient();

// --- 封装导出函数 ---

function getAiRuntimeState(): AiRuntimeState {
  return aiClient.getAiRuntimeState();
}

function assertAiAvailable(): EnabledAiRuntimeState {
  return aiClient.assertAiAvailable();
}

function resolveAiTaskConfig(kind: AiTaskKind, env: AiClientEnv = getAppEnv()): ResolvedAiTaskConfig {
  return resolveTaskConfig(kind, env);
}

function runBasicAnalysis(input: AiPromptInput): Promise<BasicAnalysis> {
  return aiClient.runBasicAnalysis(input);
}

function runHeavySummary(input: AiPromptInput): Promise<HeavySummary> {
  return aiClient.runHeavySummary(input);
}

export type {
  AiClientDeps,
  AiClientEnv,
  AiRuntimeState,
  AiTaskKind,
  GenerateStructuredObject,
  OpenRouterProviderFactory,
  ResolvedAiTaskConfig,
};
export {
  AiConfigurationError,
  AiProviderUnavailableError,
  assertAiAvailable,
  createAiClient,
  getAiRuntimeState,
  resolveAiTaskConfig,
  runBasicAnalysis,
  runHeavySummary,
};
