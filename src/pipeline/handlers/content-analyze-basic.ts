import type { Job } from "bullmq";
import type { JobName } from "../../queue";
import { type ContentAnalyzeBasicPayload, runContentAnalyzeBasic } from "../../services/analysis";
import type { ContentAnalyzeBasicJobData } from "../../services/content";
import { type ContentPipelineRuntimeDeps, executeContentPipelineStep } from "../../services/pipeline-runtime";
import type { PipelineStepExecutionResult } from "../types";

export type ContentAnalyzeBasicPipelineResult = PipelineStepExecutionResult<ContentAnalyzeBasicPayload>;

export function createContentAnalyzeBasicHandler(
  runAnalyzeBasic: (
    jobData: ContentAnalyzeBasicJobData,
  ) => ReturnType<typeof runContentAnalyzeBasic> = runContentAnalyzeBasic,
  runtimeDeps?: ContentPipelineRuntimeDeps,
) {
  return async function contentAnalyzeBasicHandler(
    job: Job<ContentAnalyzeBasicJobData, ContentAnalyzeBasicPipelineResult, JobName>,
  ): Promise<ContentAnalyzeBasicPipelineResult> {
    return executeContentPipelineStep({
      deps: runtimeDeps,
      jobData: job.data,
      jobName: job.name,
      runStep: runAnalyzeBasic,
    });
  };
}

export const contentAnalyzeBasicHandler = createContentAnalyzeBasicHandler();
