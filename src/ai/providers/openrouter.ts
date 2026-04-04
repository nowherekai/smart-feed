import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";

import { createLogger } from "../../utils";
import { AiConfigurationError } from "../errors";
import type { AiProvider } from "../provider";
import type { AiClientEnv, GenerateStructuredObject, OpenRouterProviderFactory } from "../types";

const logger = createLogger("AiClient");

export const defaultGenerateStructuredObject: GenerateStructuredObject = async ({
  model,
  prompt,
  schema,
  schemaDescription,
  schemaName,
  system,
}) => {
  logger.debug("defaultGenerateStructuredObject", {
    schemaDescription,
    schemaName,
  });

  const result = await generateText({
    model: model as Parameters<typeof generateText>[0]["model"],
    output: Output.object({
      schema,
    }),
    prompt,
    system,
  });

  return {
    object: result.output,
  };
};

export const defaultOpenRouterProviderFactory: OpenRouterProviderFactory = (config) =>
  createOpenAI(config) as unknown as ReturnType<OpenRouterProviderFactory>;

export function resolveOpenRouterApiKey(env: AiClientEnv): string {
  if (env.openRouterApiKey === null) {
    throw new AiConfigurationError("[ai/client] SMART_FEED_AI_PROVIDER=openrouter requires OPENROUTER_API_KEY.");
  }

  return env.openRouterApiKey;
}

type OpenRouterProviderOptions = {
  env: AiClientEnv;
  generateStructuredObject?: GenerateStructuredObject;
  openRouterProviderFactory?: OpenRouterProviderFactory;
};

export class OpenRouterProvider implements AiProvider {
  readonly name = "openrouter" as const;

  private readonly env: AiClientEnv;
  private readonly generateStructuredObject: GenerateStructuredObject;
  private readonly openRouterProviderFactory: OpenRouterProviderFactory;
  private cachedProvider: ReturnType<OpenRouterProviderFactory> | null = null;

  constructor(options: OpenRouterProviderOptions) {
    this.env = options.env;
    this.generateStructuredObject = options.generateStructuredObject ?? defaultGenerateStructuredObject;
    this.openRouterProviderFactory = options.openRouterProviderFactory ?? defaultOpenRouterProviderFactory;
  }

  async execute<TOutput>(options: Parameters<AiProvider["execute"]>[0]) {
    const { input, kind, modelId, promptDefinition } = options;
    const provider = this.getProvider();
    const messages = promptDefinition.buildMessages(input);

    logger.info("Calling structured AI generation", {
      kind,
      modelId,
      provider: this.name,
      runtimeState: this.name,
      schemaName: promptDefinition.schemaName,
    });

    try {
      const result = await this.generateStructuredObject({
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
        provider: this.name,
        runtimeState: this.name,
        schemaName: promptDefinition.schemaName,
      });

      return output as TOutput;
    } catch (error) {
      logger.error("AI prompt execution failed", {
        error: error instanceof Error ? error.message : String(error),
        kind,
        modelId,
        provider: this.name,
        runtimeState: this.name,
        schemaName: promptDefinition.schemaName,
      });
      throw error;
    }
  }

  private getProvider(): ReturnType<OpenRouterProviderFactory> {
    if (this.cachedProvider === null) {
      logger.info("Initializing OpenRouter provider", {
        baseURL: this.env.openRouterBaseUrl,
        provider: this.name,
      });

      this.cachedProvider = this.openRouterProviderFactory({
        apiKey: resolveOpenRouterApiKey(this.env),
        baseURL: this.env.openRouterBaseUrl,
        name: "openrouter",
      });
    }

    return this.cachedProvider;
  }
}
