import type { ContentPipelineJobData, PipelineStepExecutionResult, PipelineStepResult } from "../pipeline/types";
import { createQueue, type JobName } from "../queue";
import {
  createPipelineRun,
  createStepRun,
  type NewPipelineRun,
  type NewStepRun,
  updatePipelineRun,
  updateStepRun,
} from "./pipeline-tracking";

const CONTENT_PIPELINE_NAME = "content-processing";
const CONTENT_PIPELINE_VERSION = "v1";

type EnqueueJob = (jobName: JobName, data: Record<string, unknown>) => Promise<void>;

type ContentPipelineRuntimeDeps = {
  createPipelineRun?: (data: NewPipelineRun) => Promise<{ id: string }>;
  createStepRun?: (data: NewStepRun) => Promise<{ id: string }>;
  enqueueJob?: EnqueueJob;
  now?: () => Date;
  updatePipelineRun?: (id: string, data: Partial<Omit<NewPipelineRun, "id">>) => Promise<void>;
  updateStepRun?: (id: string, data: Partial<Omit<NewStepRun, "id">>) => Promise<void>;
};

type ExecuteContentPipelineStepOptions<
  TJobData extends ContentPipelineJobData,
  TPayload extends Record<string, unknown>,
> = {
  deps?: ContentPipelineRuntimeDeps;
  jobData: TJobData;
  jobName: JobName;
  runStep: (jobData: TJobData) => Promise<PipelineStepResult<TPayload>>;
};

function serialize(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }

  return JSON.stringify(value);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown pipeline runtime error.";
}

async function defaultEnqueueJob(jobName: JobName, data: Record<string, unknown>): Promise<void> {
  const queue = createQueue<Record<string, unknown>>();
  await queue.add(jobName, data);
}

function buildRuntimeDeps(overrides: ContentPipelineRuntimeDeps = {}): Required<ContentPipelineRuntimeDeps> {
  return {
    createPipelineRun: overrides.createPipelineRun ?? createPipelineRun,
    createStepRun: overrides.createStepRun ?? createStepRun,
    enqueueJob: overrides.enqueueJob ?? defaultEnqueueJob,
    now: overrides.now ?? (() => new Date()),
    updatePipelineRun: overrides.updatePipelineRun ?? updatePipelineRun,
    updateStepRun: overrides.updateStepRun ?? updateStepRun,
  };
}

function withPipelineRunId<TData extends Record<string, unknown>>(data: TData, pipelineRunId: string): TData {
  return {
    ...data,
    pipelineRunId,
  };
}

export async function executeContentPipelineStep<
  TJobData extends ContentPipelineJobData,
  TPayload extends Record<string, unknown>,
>(options: ExecuteContentPipelineStepOptions<TJobData, TPayload>): Promise<PipelineStepExecutionResult<TPayload>> {
  const { jobData, jobName, runStep } = options;
  const deps = buildRuntimeDeps(options.deps);
  const startedAt = deps.now();

  let pipelineRunId = jobData.pipelineRunId;

  if (!pipelineRunId) {
    const pipelineRun = await deps.createPipelineRun({
      contentId: jobData.contentId,
      pipelineName: CONTENT_PIPELINE_NAME,
      pipelineVersion: CONTENT_PIPELINE_VERSION,
      startedAt,
      status: "running",
    });

    pipelineRunId = pipelineRun.id;
  } else {
    await deps.updatePipelineRun(pipelineRunId, {
      status: "running",
    });
  }

  const stepRun = await deps.createStepRun({
    inputRef: serialize(jobData),
    pipelineRunId,
    startedAt,
    status: "running",
    stepName: jobName,
  });

  try {
    const result = await runStep(jobData);
    const outputRef = serialize({
      message: result.message ?? null,
      nextStep: result.nextStep
        ? {
            data: result.nextStep.data,
            jobName: result.nextStep.jobName,
          }
        : null,
      outcome: result.outcome,
      payload: result.payload,
      status: result.status,
    });

    if (result.status === "failed") {
      const finishedAt = deps.now();

      await deps.updateStepRun(stepRun.id, {
        errorMessage: result.message ?? "Unknown step failure.",
        finishedAt,
        outputRef,
        status: "failed",
      });
      await deps.updatePipelineRun(pipelineRunId, {
        finishedAt,
        status: "failed",
      });

      return {
        jobName,
        message: result.message ?? null,
        nextStepQueued: false,
        outcome: result.outcome,
        payload: result.payload,
        pipelineRunId,
        status: result.status,
      };
    }

    let nextStepQueued = false;

    if (result.nextStep) {
      await deps.enqueueJob(result.nextStep.jobName, withPipelineRunId(result.nextStep.data, pipelineRunId));
      nextStepQueued = true;
    }

    const finishedAt = deps.now();

    await deps.updateStepRun(stepRun.id, {
      errorMessage: null,
      finishedAt,
      outputRef,
      status: "completed",
    });

    if (!result.nextStep) {
      await deps.updatePipelineRun(pipelineRunId, {
        finishedAt,
        status: "completed",
      });
    }

    return {
      jobName,
      message: result.message ?? null,
      nextStepQueued,
      outcome: result.outcome,
      payload: result.payload,
      pipelineRunId,
      status: result.status,
    };
  } catch (error) {
    const finishedAt = deps.now();
    const errorMessage = toErrorMessage(error);

    await deps.updateStepRun(stepRun.id, {
      errorMessage,
      finishedAt,
      outputRef: null,
      status: "failed",
    });
    await deps.updatePipelineRun(pipelineRunId, {
      finishedAt,
      status: "failed",
    });

    throw error;
  }
}

export type { ContentPipelineRuntimeDeps };
export { CONTENT_PIPELINE_NAME, CONTENT_PIPELINE_VERSION };
