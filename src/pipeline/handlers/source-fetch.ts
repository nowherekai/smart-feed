import type { Job } from "bullmq";

import type { JobName } from "../../queue";
import { runSourceFetch, type SourceFetchJobData, type SourceFetchSummary } from "../../services/content";

export type SourceFetchPipelineResult = SourceFetchSummary & {
  jobName: string;
};

export function createSourceFetchHandler(
  runFetch: (jobData: SourceFetchJobData) => Promise<SourceFetchSummary> = runSourceFetch,
) {
  return async function sourceFetchHandler(
    job: Job<SourceFetchJobData, SourceFetchPipelineResult, JobName>,
  ): Promise<SourceFetchPipelineResult> {
    const result = await runFetch(job.data);

    return {
      ...result,
      jobName: job.name,
    };
  };
}

export const sourceFetchHandler = createSourceFetchHandler();
