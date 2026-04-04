import type { ZodType } from "zod";

import type { AppEnv } from "../config";
import type { AiPromptDefinition, AiPromptInput, AiPromptVersion, EnabledAiRuntimeState } from "./prompts";

export type AiRuntimeState = "disabled" | EnabledAiRuntimeState;
export type AiTaskKind = "basic" | "heavy";

export type AiClientEnv = Pick<
  AppEnv,
  "aiBasicModel" | "aiHeavyModel" | "aiProvider" | "openRouterApiKey" | "openRouterBaseUrl"
>;

export type ResolvedAiTaskConfig = {
  baseURL: string | null;
  modelId: string | null;
  modelStrategy: string | null;
  promptVersion: AiPromptVersion;
  runtimeState: AiRuntimeState;
};

export type GenerateStructuredObject = <TOutput>(input: {
  model: unknown;
  prompt: string;
  schema: ZodType<TOutput>;
  schemaDescription: string;
  schemaName: string;
  system: string;
}) => Promise<{ object: TOutput }>;

export type OpenRouterProviderFactory = (config: { apiKey: string; baseURL: string; name: "openrouter" }) => {
  chat: (modelId: string) => unknown;
};

export type AiClientDeps = {
  env?: AiClientEnv;
  generateStructuredObject?: GenerateStructuredObject;
  openRouterProviderFactory?: OpenRouterProviderFactory;
};

export type StructuredPromptDefinition<TOutput> = Pick<
  AiPromptDefinition<TOutput>,
  "buildMessages" | "schema" | "schemaDescription" | "schemaName"
>;

export type { AiPromptInput };
