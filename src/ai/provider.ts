import type { EnabledAiRuntimeState } from "./prompts";
import type { AiPromptInput, AiTaskKind, StructuredPromptDefinition } from "./types";

export interface AiProvider {
  readonly name: EnabledAiRuntimeState;

  execute<TOutput>(options: {
    input: AiPromptInput;
    kind: AiTaskKind;
    modelId: string;
    promptDefinition: StructuredPromptDefinition<TOutput>;
  }): Promise<TOutput>;
}
