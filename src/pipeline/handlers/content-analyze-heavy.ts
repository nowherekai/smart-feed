import type { Job } from "bullmq";
import type { JobName } from "../../queue";
import { type ContentAnalyzeHeavyPayload, runContentAnalyzeHeavy } from "../../services/analysis";
import type { ContentAnalyzeHeavyJobData } from "../../services/content";
import { type ContentPipelineRuntimeDeps, executeContentPipelineStep } from "../../services/pipeline-runtime";
import type { PipelineStepExecutionResult } from "../types";

export type ContentAnalyzeHeavyPipelineResult = PipelineStepExecutionResult<ContentAnalyzeHeavyPayload>;

export function createContentAnalyzeHeavyHandler(
  runAnalyzeHeavy: (
    jobData: ContentAnalyzeHeavyJobData,
  ) => ReturnType<typeof runContentAnalyzeHeavy> = runContentAnalyzeHeavy,
  runtimeDeps?: ContentPipelineRuntimeDeps,
) {
  return async function contentAnalyzeHeavyHandler(
    job: Job<ContentAnalyzeHeavyJobData, ContentAnalyzeHeavyPipelineResult, JobName>,
  ): Promise<ContentAnalyzeHeavyPipelineResult> {
    return executeContentPipelineStep({
      deps: runtimeDeps,
      jobData: job.data,
      jobName: job.name,
      runStep: runAnalyzeHeavy,
    });
  };
}

export const contentAnalyzeHeavyHandler = createContentAnalyzeHeavyHandler();
