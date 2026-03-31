import type { JobName } from "../queue";

export type PipelineStepOutcome = "completed" | "completed_with_fallback" | "failed";

export type PipelineStepStatus = "completed" | "failed";

export type PipelineNextStep<TData extends Record<string, unknown> = Record<string, unknown>> = {
  data: TData;
  jobName: JobName;
};

export type PipelineStepResult<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
  TNextData extends Record<string, unknown> = Record<string, unknown>,
> = {
  message?: string | null;
  nextStep?: PipelineNextStep<TNextData> | null;
  outcome: PipelineStepOutcome;
  payload?: TPayload;
  status: PipelineStepStatus;
};

export type PipelineStepExecutionResult<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  jobName: JobName;
  message?: string | null;
  nextStepQueued: boolean;
  outcome: PipelineStepOutcome;
  payload?: TPayload;
  pipelineRunId: string;
  status: PipelineStepStatus;
};

export type ContentPipelineJobData = {
  contentId: string;
  pipelineRunId?: string;
  trigger: string;
};

export function createCompletedStepResult<
  TPayload extends Record<string, unknown>,
  TNextData extends Record<string, unknown> = Record<string, unknown>,
>(input: {
  message?: string | null;
  nextStep?: PipelineNextStep<TNextData> | null;
  outcome?: Extract<PipelineStepOutcome, "completed" | "completed_with_fallback">;
  payload?: TPayload;
}): PipelineStepResult<TPayload, TNextData> {
  return {
    message: input.message ?? null,
    nextStep: input.nextStep ?? null,
    outcome: input.outcome ?? "completed",
    payload: input.payload,
    status: "completed",
  };
}

export function createFailedStepResult<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
  TNextData extends Record<string, unknown> = Record<string, unknown>,
>(input: { message: string; payload?: TPayload }): PipelineStepResult<TPayload, TNextData> {
  return {
    message: input.message,
    nextStep: null,
    outcome: "failed",
    payload: input.payload,
    status: "failed",
  };
}
