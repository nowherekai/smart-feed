import type { Job, Processor } from "bullmq";

import { type JobName, jobNames } from "../queue";

export type PipelineJobData = Record<string, unknown>;

export type PipelineJobResult = {
  jobName: string;
  status: "pending_implementation";
};

type PipelineProcessor = Processor<PipelineJobData, PipelineJobResult, JobName>;

async function placeholderHandler(job: Job<PipelineJobData, PipelineJobResult, JobName>): Promise<PipelineJobResult> {
  console.info(`[pipeline] placeholder handler invoked for ${job.name}`);

  return {
    jobName: job.name,
    status: "pending_implementation",
  };
}

export const pipelineHandlers = {
  [jobNames.sourceImport]: placeholderHandler,
  [jobNames.sourceFetch]: placeholderHandler,
  [jobNames.contentFetchHtml]: placeholderHandler,
  [jobNames.contentNormalize]: placeholderHandler,
  [jobNames.contentAnalyzeBasic]: placeholderHandler,
  [jobNames.contentAnalyzeHeavy]: placeholderHandler,
  [jobNames.digestCompose]: placeholderHandler,
  [jobNames.digestDeliver]: placeholderHandler,
} satisfies Record<JobName, PipelineProcessor>;
