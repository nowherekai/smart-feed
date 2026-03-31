import type { Job } from "bullmq";
import type { JobName } from "../../queue";
import {
  type ContentFetchHtmlJobData,
  type ContentFetchHtmlPayload,
  runContentFetchHtml,
} from "../../services/content";
import { type ContentPipelineRuntimeDeps, executeContentPipelineStep } from "../../services/pipeline-runtime";
import type { PipelineStepExecutionResult } from "../types";

export type ContentFetchHtmlPipelineResult = PipelineStepExecutionResult<ContentFetchHtmlPayload>;

export function createContentFetchHtmlHandler(
  runFetchHtml: (jobData: ContentFetchHtmlJobData) => ReturnType<typeof runContentFetchHtml> = runContentFetchHtml,
  runtimeDeps?: ContentPipelineRuntimeDeps,
) {
  return async function contentFetchHtmlHandler(
    job: Job<ContentFetchHtmlJobData, ContentFetchHtmlPipelineResult, JobName>,
  ): Promise<ContentFetchHtmlPipelineResult> {
    return executeContentPipelineStep({
      deps: runtimeDeps,
      jobData: job.data,
      jobName: job.name,
      runStep: runFetchHtml,
    });
  };
}

export const contentFetchHtmlHandler = createContentFetchHtmlHandler();
