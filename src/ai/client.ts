/**
 * AI 客户端适配层模块
 * 负责与 AI 服务商（如 OpenRouter）进行结构化交互。
 * 包含：AI SDK 初始化、任务配置解析、Dummy Provider 模拟、结构化输出校验及错误处理。
 */

import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import type { ZodType } from "zod";

import { type AppEnv, getAppEnv } from "../config";
import { createLogger } from "../utils";
import {
  type AiPromptInput,
  type AiPromptVersion,
  type EnabledAiRuntimeState,
  getPromptDefinition,
} from "./prompts";
import type { BasicAnalysis, HeavySummary } from "./schemas";

/** AI 运行时状态联合类型 */
type AiRuntimeState = "disabled" | EnabledAiRuntimeState;
/** AI 任务种类 */
type AiTaskKind = "basic" | "heavy";
/** AI 客户端所需的配置子集 */
type AiClientEnv = Pick<
  AppEnv,
  | "aiBasicModel"
  | "aiHeavyModel"
  | "aiProvider"
  | "openRouterApiKey"
  | "openRouterBaseUrl"
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
type OpenRouterProviderFactory = (config: {
  apiKey: string;
  baseURL: string;
  name: "openrouter";
}) => {
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

const logger = createLogger("AiClient");

type JsonRecord = Record<string, unknown>;

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

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getFirstDefinedValue(
  record: JsonRecord,
  aliases: readonly string[],
): unknown {
  for (const alias of aliases) {
    if (Object.hasOwn(record, alias)) {
      return record[alias];
    }
  }

  return undefined;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => normalizeString(item))
      .filter((item): item is string => item !== undefined);

    return normalized.length > 0 ? normalized : undefined;
  }

  const singleValue = normalizeString(value);

  if (singleValue === undefined) {
    return undefined;
  }

  const normalized = singleValue
    .split(/[\n,，、;；]+/u)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return normalized.length > 0 ? normalized : undefined;
}

function normalizePoints(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => normalizeString(item))
      .filter((item): item is string => item !== undefined);

    return normalized.length > 0 ? normalized.slice(0, 3) : undefined;
  }

  const singleValue = normalizeString(value);

  if (singleValue === undefined) {
    return undefined;
  }

  const normalized = singleValue
    .split(/\n+|^[-*•]\s*|[；;]+/mu)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return normalized.length > 0 ? normalized.slice(0, 3) : undefined;
}

function normalizeLanguage(value: unknown): string | undefined {
  const normalized = normalizeString(value)?.toLowerCase();

  if (normalized === undefined) {
    return undefined;
  }

  if (
    normalized === "zh" ||
    normalized === "zh-cn" ||
    normalized === "zh_hans" ||
    normalized === "cn" ||
    normalized.includes("中文") ||
    normalized.includes("汉语") ||
    normalized.includes("chinese")
  ) {
    return "zh";
  }

  if (
    normalized === "en" ||
    normalized === "en-us" ||
    normalized.includes("英文") ||
    normalized.includes("英语") ||
    normalized.includes("english")
  ) {
    return "en";
  }

  return normalized;
}

function normalizeSentiment(
  value: unknown,
): BasicAnalysis["sentiment"] | undefined {
  const normalized = normalizeString(value)?.toLowerCase();

  if (normalized === undefined) {
    return undefined;
  }

  if (
    normalized === "positive" ||
    normalized.includes("积极") ||
    normalized.includes("正面")
  ) {
    return "positive";
  }

  if (
    normalized === "neutral" ||
    normalized.includes("中性") ||
    normalized.includes("客观")
  ) {
    return "neutral";
  }

  if (
    normalized === "negative" ||
    normalized.includes("消极") ||
    normalized.includes("负面")
  ) {
    return "negative";
  }

  if (
    normalized === "mixed" ||
    normalized.includes("混合") ||
    normalized.includes("复杂")
  ) {
    return "mixed";
  }

  return undefined;
}

function normalizeValueScoreNumber(value: number): number | undefined {
  if (!Number.isFinite(value)) {
    return undefined;
  }

  let normalized = value;

  if (normalized >= 0 && normalized <= 1) {
    normalized *= 10;
  } else if (normalized > 10 && normalized <= 100) {
    normalized /= 10;
  }

  const rounded = Math.round(normalized);

  if (rounded < 0 || rounded > 10) {
    return undefined;
  }

  return rounded;
}

function normalizeValueScore(value: unknown): number | undefined {
  if (typeof value === "number") {
    return normalizeValueScoreNumber(value);
  }

  const normalized = normalizeString(value);

  if (normalized === undefined) {
    return undefined;
  }

  const outOfTenMatch = normalized.match(/-?\d+(?:\.\d+)?(?=\s*\/\s*10)/u);

  if (outOfTenMatch?.[0] !== undefined) {
    return normalizeValueScoreNumber(Number.parseFloat(outOfTenMatch[0]));
  }

  const numericMatch = normalized.match(/-?\d+(?:\.\d+)?/u);

  if (numericMatch?.[0] !== undefined) {
    return normalizeValueScoreNumber(Number.parseFloat(numericMatch[0]));
  }

  return undefined;
}

function extractJsonTextCandidate(text: string): string | null {
  const trimmed = text.trim();
  const codeFenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
  const candidate = codeFenceMatch?.[1] ?? trimmed;
  const firstBraceIndex = candidate.indexOf("{");
  const lastBraceIndex = candidate.lastIndexOf("}");

  if (firstBraceIndex === -1 || lastBraceIndex <= firstBraceIndex) {
    return null;
  }

  return candidate.slice(firstBraceIndex, lastBraceIndex + 1);
}

function parseJsonTextCandidate(text: string): unknown | null {
  const candidate = extractJsonTextCandidate(text);

  if (candidate === null) {
    return null;
  }

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function normalizeBasicAnalysisCandidate(
  value: unknown,
): Partial<BasicAnalysis> | null {
  if (!isJsonRecord(value)) {
    return null;
  }

  return {
    categories: normalizeStringArray(
      getFirstDefinedValue(value, ["categories", "分类"]),
    ),
    keywords: normalizeStringArray(
      getFirstDefinedValue(value, ["keywords", "关键词"]),
    ),
    entities: normalizeStringArray(
      getFirstDefinedValue(value, ["entities", "实体"]),
    ),
    language: normalizeLanguage(
      getFirstDefinedValue(value, ["language", "语言"]),
    ),
    sentiment: normalizeSentiment(
      getFirstDefinedValue(value, ["sentiment", "情绪"]),
    ),
    valueScore: normalizeValueScore(
      getFirstDefinedValue(value, ["valueScore", "价值分"]),
    ),
  };
}

function normalizeHeavySummaryCandidate(
  value: unknown,
): Partial<HeavySummary> | null {
  if (!isJsonRecord(value)) {
    return null;
  }

  return {
    oneline: normalizeString(
      getFirstDefinedValue(value, [
        "oneline",
        "一句话总结",
        "单行总结",
        "总结",
      ]),
    ),
    points: normalizePoints(
      getFirstDefinedValue(value, ["points", "要点", "关键要点", "要点列表"]),
    ),
    reason: normalizeString(
      getFirstDefinedValue(value, ["reason", "关注理由", "推荐理由", "理由"]),
    ),
    evidenceSnippet: normalizeString(
      getFirstDefinedValue(value, [
        "evidenceSnippet",
        "证据片段",
        "证据",
        "引用片段",
      ]),
    ),
  };
}

function buildRepairedObject(
  schemaName: string,
  value: unknown,
): JsonRecord | null {
  if (schemaName === "basic_analysis") {
    return normalizeBasicAnalysisCandidate(value) as JsonRecord | null;
  }

  if (schemaName === "heavy_summary") {
    return normalizeHeavySummaryCandidate(value) as JsonRecord | null;
  }

  return null;
}

function tryRepairStructuredObjectText<TOutput>(options: {
  schema: ZodType<TOutput>;
  schemaName: string;
  text: string;
}): TOutput | null {
  const parsedCandidate = parseJsonTextCandidate(options.text);

  if (parsedCandidate === null) {
    return null;
  }

  const repairedCandidate = buildRepairedObject(
    options.schemaName,
    parsedCandidate,
  );

  if (repairedCandidate === null) {
    return null;
  }

  const parseResult = options.schema.safeParse(repairedCandidate);

  return parseResult.success ? parseResult.data : null;
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
  logger.debug(`defaultGenerateStructuredObject`);
  let repairApplied = false;
  let repairErrorMessage: string | null = null;
  const result = await generateText({
    model: model as Parameters<typeof generateText>[0]["model"],
    system,
    prompt,
    output: Output.object({
      schema,
    }),
  });

  if (!repairApplied && repairErrorMessage !== null) {
    logger.warn("Structured AI output could not be repaired", {
      repairError: repairErrorMessage,
      schemaName,
    });
  }

  return {
    object: result.output,
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
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength - 1)}…`;
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
  const englishTokens = Array.from(
    text.toLowerCase().matchAll(/\b[a-z][a-z0-9-]{3,}\b/g),
    (match) => match[0],
  );
  const chineseTokens = Array.from(
    text.matchAll(/[\u4e00-\u9fff]{2,6}/gu),
    (match) => match[0],
  );
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
  const valueScore = inferValueScore(
    `${input.title}\n${input.cleanedMd}`,
    categories,
  );

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
    const envKey =
      kind === "basic"
        ? "SMART_FEED_AI_BASIC_MODEL"
        : "SMART_FEED_AI_HEAVY_MODEL";
    throw new AiConfigurationError(
      `[ai/client] SMART_FEED_AI_PROVIDER=openrouter requires ${envKey}.`,
    );
  }

  return modelId;
}

function resolveOpenRouterApiKey(env: AiClientEnv): string {
  if (env.openRouterApiKey === null) {
    throw new AiConfigurationError(
      "[ai/client] SMART_FEED_AI_PROVIDER=openrouter requires OPENROUTER_API_KEY.",
    );
  }

  return env.openRouterApiKey;
}

function getRuntimeStateFromEnv(env: AiClientEnv): AiRuntimeState {
  return env.aiProvider ?? "disabled";
}

function summarizeAiInput(input: AiPromptInput) {
  return {
    cleanedMdLength: input.cleanedMd.length,
    originalUrlHost: (() => {
      try {
        return new URL(input.originalUrl).host;
      } catch {
        return null;
      }
    })(),
    sourceName: input.sourceName,
    titleLength: input.title.length,
  };
}

/**
 * 将环境变量和任务类型解析为最终的 AI 任务配置
 */
function resolveTaskConfig(
  kind: AiTaskKind,
  env: AiClientEnv,
): ResolvedAiTaskConfig {
  const promptDefinition =
    kind === "basic"
      ? getPromptDefinition("basic-analysis-v1")
      : getPromptDefinition("heavy-summary-v1");
  const promptVersion = promptDefinition.promptVersion;
  const runtimeState = getRuntimeStateFromEnv(env);

  if (runtimeState === "disabled") {
    const config = {
      baseURL: null,
      modelId: null,
      modelStrategy: null,
      promptVersion,
      runtimeState,
    };

    logger.debug("AI task config resolved", {
      kind,
      modelId: config.modelId,
      modelStrategy: config.modelStrategy,
      promptVersion: config.promptVersion,
      runtimeState: config.runtimeState,
    });

    return config;
  }

  if (runtimeState === "dummy") {
    const config = {
      baseURL: null,
      modelId: "dummy",
      modelStrategy: promptDefinition.getModelStrategy(runtimeState),
      promptVersion,
      runtimeState,
    };

    logger.debug("AI task config resolved", {
      kind,
      modelId: config.modelId,
      modelStrategy: config.modelStrategy,
      promptVersion: config.promptVersion,
      runtimeState: config.runtimeState,
    });

    return config;
  }

  // 校验 API Key
  resolveOpenRouterApiKey(env);

  const config = {
    baseURL: env.openRouterBaseUrl,
    modelId: resolveModelId(kind, env),
    modelStrategy: promptDefinition.getModelStrategy(runtimeState),
    promptVersion,
    runtimeState,
  };

  logger.debug("AI task config resolved", {
    baseURL: config.baseURL,
    kind,
    modelId: config.modelId,
    modelStrategy: config.modelStrategy,
    promptVersion: config.promptVersion,
    runtimeState: config.runtimeState,
  });

  return config;
}

/**
 * AI 客户端工厂
 */
function createAiClient(deps: AiClientDeps = {}) {
  const env = deps.env ?? getAppEnv();
  const generateStructuredObject =
    deps.generateStructuredObject ?? defaultGenerateStructuredObject;
  const openRouterProviderFactory =
    deps.openRouterProviderFactory ?? defaultOpenRouterProviderFactory;
  let cachedOpenRouterProvider: ReturnType<OpenRouterProviderFactory> | null =
    null;

  function getAiRuntimeState(): AiRuntimeState {
    return getRuntimeStateFromEnv(env);
  }

  function assertAiAvailable(): EnabledAiRuntimeState {
    const runtimeState = getAiRuntimeState();

    if (runtimeState === "disabled") {
      logger.warn("AI provider is unavailable", { runtimeState });
      throw new AiProviderUnavailableError();
    }

    return runtimeState;
  }

  function getOpenRouterProvider(): ReturnType<OpenRouterProviderFactory> {
    if (cachedOpenRouterProvider === null) {
      logger.info("Initializing OpenRouter provider", {
        baseURL: env.openRouterBaseUrl,
      });

      cachedOpenRouterProvider = openRouterProviderFactory({
        apiKey: resolveOpenRouterApiKey(env),
        baseURL: env.openRouterBaseUrl,
        name: "openrouter",
      });
    }

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

    logger.info("AI prompt execution started", {
      kind,
      runtimeState,
      schemaName: promptDefinition.schemaName,
      ...summarizeAiInput(input),
    });

    // 如果是 Dummy 模式，直接基于规则生成假数据并校验
    if (runtimeState === "dummy") {
      const output = promptDefinition.schema.parse(buildDummyOutput(input));

      logger.info("AI prompt execution completed with dummy provider", {
        kind,
        runtimeState,
        schemaName: promptDefinition.schemaName,
      });

      return output;
    }

    // 否则调用真实 AI 模型
    const provider = getOpenRouterProvider();
    const messages = promptDefinition.buildMessages(input);
    const modelId = resolveModelId(kind, env);

    logger.info("Calling structured AI generation", {
      kind,
      modelId,
      runtimeState,
      schemaName: promptDefinition.schemaName,
    });

    try {
      const result = await generateStructuredObject({
        model: provider.chat(modelId),
        prompt: messages.prompt,
        schema: promptDefinition.schema,
        schemaDescription: promptDefinition.schemaDescription,
        schemaName: promptDefinition.schemaName,
        system: messages.system,
      });
      const output = promptDefinition.schema.parse(result.object);

      logger.info("AI prompt execution completed", {
        kind,
        modelId,
        runtimeState,
        schemaName: promptDefinition.schemaName,
      });

      return output;
    } catch (error) {
      logger.error("AI prompt execution failed", {
        error: error instanceof Error ? error.message : String(error),
        kind,
        modelId,
        runtimeState,
        schemaName: promptDefinition.schemaName,
      });
      throw error;
    }
  }

  return {
    assertAiAvailable,
    getAiRuntimeState,
    resolveAiTaskConfig(kind: AiTaskKind): ResolvedAiTaskConfig {
      return resolveTaskConfig(kind, env);
    },
    /** 执行基础分析 */
    async runBasicAnalysis(input: AiPromptInput): Promise<BasicAnalysis> {
      logger.info(`runBasicAnalysis: ${input.sourceName}:${input.originalUrl}`);
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

function resolveAiTaskConfig(
  kind: AiTaskKind,
  env: AiClientEnv = getAppEnv(),
): ResolvedAiTaskConfig {
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
  tryRepairStructuredObjectText,
};
