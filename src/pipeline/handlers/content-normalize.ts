import type { Job } from "bullmq";

import type { JobName } from "../../queue";
import {
  type ContentNormalizeJobData,
  type ContentNormalizeSummary,
  runContentNormalize,
} from "../../services/content";

export type ContentNormalizePipelineResult = ContentNormalizeSummary & {
  jobName: string;
};

export function createContentNormalizeHandler(
  runNormalize: (jobData: ContentNormalizeJobData) => Promise<ContentNormalizeSummary> = runContentNormalize,
) {
  return async function contentNormalizeHandler(
    job: Job<ContentNormalizeJobData, ContentNormalizePipelineResult, JobName>,
  ): Promise<ContentNormalizePipelineResult> {
    const result = await runNormalize(job.data);

    return {
      ...result,
      jobName: job.name,
    };
  };
}

export const contentNormalizeHandler = createContentNormalizeHandler();
