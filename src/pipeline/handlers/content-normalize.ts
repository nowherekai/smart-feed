import type { Job } from "bullmq";
import type { JobName } from "../../queue";
import {
  type ContentNormalizeJobData,
  type ContentNormalizePayload,
  runContentNormalize,
} from "../../services/content";
import { type ContentPipelineRuntimeDeps, executeContentPipelineStep } from "../../services/pipeline-runtime";
import type { PipelineStepExecutionResult } from "../types";

export type ContentNormalizePipelineResult = PipelineStepExecutionResult<ContentNormalizePayload>;

export function createContentNormalizeHandler(
  runNormalize: (jobData: ContentNormalizeJobData) => ReturnType<typeof runContentNormalize> = runContentNormalize,
  runtimeDeps?: ContentPipelineRuntimeDeps,
) {
  return async function contentNormalizeHandler(
    job: Job<ContentNormalizeJobData, ContentNormalizePipelineResult, JobName>,
  ): Promise<ContentNormalizePipelineResult> {
    return executeContentPipelineStep({
      deps: runtimeDeps,
      jobData: job.data,
      jobName: job.name,
      runStep: runNormalize,
    });
  };
}

export const contentNormalizeHandler = createContentNormalizeHandler();
