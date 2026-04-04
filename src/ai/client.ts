import { getAppEnv } from "../config";
import { createLogger } from "../utils";
import { AiConfigurationError, AiProviderUnavailableError } from "./errors";
import { type AiPromptInput, type AiPromptVersion, type EnabledAiRuntimeState, getPromptDefinition } from "./prompts";
import type { AiProvider } from "./provider";
import { DummyProvider } from "./providers/dummy";
import { OpenRouterProvider, resolveOpenRouterApiKey } from "./providers/openrouter";
import { tryRepairStructuredObjectText } from "./repair";
import type { BasicAnalysis, HeavySummary } from "./schemas";
import type {
  AiClientDeps,
  AiClientEnv,
  AiRuntimeState,
  AiTaskKind,
  GenerateStructuredObject,
  OpenRouterProviderFactory,
  ResolvedAiTaskConfig,
  StructuredPromptDefinition,
} from "./types";

const logger = createLogger("AiClient");

function resolveModelId(kind: AiTaskKind, env: AiClientEnv): string {
  const modelId = kind === "basic" ? env.aiBasicModel : env.aiHeavyModel;

  if (modelId === null) {
    const envKey = kind === "basic" ? "SMART_FEED_AI_BASIC_MODEL" : "SMART_FEED_AI_HEAVY_MODEL";
    throw new AiConfigurationError(`[ai/client] SMART_FEED_AI_PROVIDER=openrouter requires ${envKey}.`);
  }

  return modelId;
}

function assertResolvedModelId(taskConfig: ResolvedAiTaskConfig): string {
  if (taskConfig.modelId === null) {
    throw new AiConfigurationError("[ai/client] Resolved AI task config is missing modelId.");
  }

  return taskConfig.modelId;
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

function getPromptVersion(kind: AiTaskKind): AiPromptVersion {
  return kind === "basic" ? "basic-analysis-v1" : "heavy-summary-v1";
}

function resolveTaskConfig(kind: AiTaskKind, env: AiClientEnv): ResolvedAiTaskConfig {
  const promptDefinition = getPromptDefinition(getPromptVersion(kind));
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

function createAiClient(deps: AiClientDeps = {}) {
  const env = deps.env ?? getAppEnv();
  let cachedOpenRouterProvider: AiProvider | null = null;

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

  function getProvider(runtimeState: EnabledAiRuntimeState): AiProvider {
    if (runtimeState === "dummy") {
      return new DummyProvider();
    }

    if (cachedOpenRouterProvider === null) {
      cachedOpenRouterProvider = new OpenRouterProvider({
        env,
        generateStructuredObject: deps.generateStructuredObject,
        openRouterProviderFactory: deps.openRouterProviderFactory,
      });
    }

    return cachedOpenRouterProvider;
  }

  async function runStructuredPrompt<TOutput>(options: {
    input: AiPromptInput;
    kind: AiTaskKind;
    promptDefinition: StructuredPromptDefinition<TOutput>;
  }): Promise<TOutput> {
    const { input, kind, promptDefinition } = options;
    const runtimeState = assertAiAvailable();
    const taskConfig = resolveTaskConfig(kind, env);

    logger.info("AI prompt execution started", {
      kind,
      runtimeState,
      schemaName: promptDefinition.schemaName,
      ...summarizeAiInput(input),
    });

    const provider = getProvider(runtimeState);

    return provider.execute({
      input,
      kind,
      modelId: assertResolvedModelId(taskConfig),
      promptDefinition,
    });
  }

  return {
    assertAiAvailable,
    getAiRuntimeState,
    resolveAiTaskConfig(kind: AiTaskKind): ResolvedAiTaskConfig {
      return resolveTaskConfig(kind, env);
    },
    async runBasicAnalysis(input: AiPromptInput): Promise<BasicAnalysis> {
      logger.info(`runBasicAnalysis: ${input.sourceName}:${input.originalUrl}`);

      return runStructuredPrompt({
        input,
        kind: "basic",
        promptDefinition: getPromptDefinition("basic-analysis-v1"),
      });
    },
    async runHeavySummary(input: AiPromptInput): Promise<HeavySummary> {
      return runStructuredPrompt({
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
  tryRepairStructuredObjectText,
};
