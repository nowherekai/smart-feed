import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import type { ZodType } from "zod";

import { type AppEnv, getAppEnv } from "../config";
import { type AiPromptInput, type AiPromptVersion, type EnabledAiRuntimeState, getPromptDefinition } from "./prompts";
import type { BasicAnalysis, HeavySummary } from "./schemas";

type AiRuntimeState = "disabled" | EnabledAiRuntimeState;
type AiTaskKind = "basic" | "heavy";
type AiClientEnv = Pick<
  AppEnv,
  "aiBasicModel" | "aiHeavyModel" | "aiProvider" | "openRouterApiKey" | "openRouterBaseUrl"
>;

type GenerateStructuredObject = <TOutput>(input: {
  model: unknown;
  prompt: string;
  schema: ZodType<TOutput>;
  schemaDescription: string;
  schemaName: string;
  system: string;
}) => Promise<{ object: TOutput }>;

type OpenRouterProviderFactory = (config: { apiKey: string; baseURL: string; name: "openrouter" }) => {
  chat: (modelId: string) => unknown;
};

type ResolvedAiTaskConfig = {
  baseURL: string | null;
  modelId: string | null;
  modelStrategy: string | null;
  promptVersion: AiPromptVersion;
  runtimeState: AiRuntimeState;
};

type AiClientDeps = {
  env?: AiClientEnv;
  generateStructuredObject?: GenerateStructuredObject;
  openRouterProviderFactory?: OpenRouterProviderFactory;
};

type StructuredPromptDefinition<TOutput> = {
  buildMessages: (input: AiPromptInput) => {
    prompt: string;
    system: string;
  };
  schema: ZodType<TOutput>;
  schemaDescription: string;
  schemaName: string;
};

class AiProviderUnavailableError extends Error {
  readonly code = "AI_PROVIDER_UNAVAILABLE";

  constructor(
    message = "[ai/client] AI provider is not configured. Set SMART_FEED_AI_PROVIDER before running AI stages.",
  ) {
    super(message);
    this.name = "AiProviderUnavailableError";
  }
}

class AiConfigurationError extends Error {
  readonly code = "AI_CONFIGURATION_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "AiConfigurationError";
  }
}

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

const defaultOpenRouterProviderFactory: OpenRouterProviderFactory = (config) =>
  createOpenAI(config) as unknown as ReturnType<OpenRouterProviderFactory>;

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

function inferLanguage(text: string): BasicAnalysis["language"] {
  return /[\u4e00-\u9fff]/u.test(text) ? "zh" : "en";
}

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

function inferKeywords(text: string): string[] {
  const englishTokens = Array.from(text.toLowerCase().matchAll(/\b[a-z][a-z0-9-]{3,}\b/g), (match) => match[0]);
  const chineseTokens = Array.from(text.matchAll(/[\u4e00-\u9fff]{2,6}/gu), (match) => match[0]);
  const keywords = [...englishTokens, ...chineseTokens]
    .map((token) => token.trim())
    .filter((token, index, list) => list.indexOf(token) === index);

  return keywords.slice(0, 8);
}

function inferEntities(input: AiPromptInput): string[] {
  const entities = new Set<string>([input.sourceName]);

  for (const match of input.cleanedMd.matchAll(/\b[A-Z][A-Za-z0-9-]{2,}\b/g)) {
    entities.add(match[0]);
  }

  return Array.from(entities).slice(0, 6);
}

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

function resolveTaskConfig(kind: AiTaskKind, env: AiClientEnv): ResolvedAiTaskConfig {
  const promptDefinition =
    kind === "basic" ? getPromptDefinition("basic-analysis-v1") : getPromptDefinition("heavy-summary-v1");
  const promptVersion = promptDefinition.promptVersion;
  const runtimeState = getRuntimeStateFromEnv(env);

  if (runtimeState === "disabled") {
    return {
      baseURL: null,
      modelId: null,
      modelStrategy: null,
      promptVersion,
      runtimeState,
    };
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

  resolveOpenRouterApiKey(env);

  return {
    baseURL: env.openRouterBaseUrl,
    modelId: resolveModelId(kind, env),
    modelStrategy: promptDefinition.getModelStrategy(runtimeState),
    promptVersion,
    runtimeState,
  };
}

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

  async function runStructuredPrompt<TOutput>(options: {
    buildDummyOutput: (input: AiPromptInput) => TOutput;
    input: AiPromptInput;
    kind: AiTaskKind;
    promptDefinition: StructuredPromptDefinition<TOutput>;
  }): Promise<TOutput> {
    const { buildDummyOutput, input, kind, promptDefinition } = options;
    const runtimeState = assertAiAvailable();

    if (runtimeState === "dummy") {
      return promptDefinition.schema.parse(buildDummyOutput(input));
    }

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
    async runBasicAnalysis(input: AiPromptInput): Promise<BasicAnalysis> {
      return runStructuredPrompt({
        buildDummyOutput: buildDummyBasicAnalysis,
        input,
        kind: "basic",
        promptDefinition: getPromptDefinition("basic-analysis-v1"),
      });
    },
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

const aiClient = createAiClient();

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
