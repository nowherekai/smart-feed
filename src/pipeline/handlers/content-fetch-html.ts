import type { Job } from "bullmq";

import type { JobName } from "../../queue";
import {
  type ContentFetchHtmlJobData,
  type ContentFetchHtmlSummary,
  runContentFetchHtml,
} from "../../services/content";

export type ContentFetchHtmlPipelineResult = ContentFetchHtmlSummary & {
  jobName: string;
};

export function createContentFetchHtmlHandler(
  runFetchHtml: (jobData: ContentFetchHtmlJobData) => Promise<ContentFetchHtmlSummary> = runContentFetchHtml,
) {
  return async function contentFetchHtmlHandler(
    job: Job<ContentFetchHtmlJobData, ContentFetchHtmlPipelineResult, JobName>,
  ): Promise<ContentFetchHtmlPipelineResult> {
    const result = await runFetchHtml(job.data);

    return {
      ...result,
      jobName: job.name,
    };
  };
}

export const contentFetchHtmlHandler = createContentFetchHtmlHandler();
