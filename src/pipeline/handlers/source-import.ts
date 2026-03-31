import type { Job } from "bullmq";

import type { JobName } from "../../queue";
import { runSourceImport, type SourceImportJobData } from "../../services/source-import";

export type SourceImportPipelineResult = {
  jobName: string;
  status: "completed" | "failed";
  importRunId: string;
  mode: "single" | "opml";
  totalCount: number;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
};

export async function sourceImportHandler(
  job: Job<SourceImportJobData, SourceImportPipelineResult, JobName>,
): Promise<SourceImportPipelineResult> {
  const result = await runSourceImport(job.data);

  return {
    jobName: job.name,
    status: result.status,
    importRunId: result.importRunId,
    mode: result.mode,
    totalCount: result.totalCount,
    createdCount: result.createdCount,
    skippedCount: result.skippedCount,
    failedCount: result.failedCount,
  };
}
