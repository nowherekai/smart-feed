import type { Job, Processor } from "bullmq";

import { type JobName, jobNames } from "../../queue";
import { type SourceImportPipelineResult, sourceImportHandler } from "./source-import";

export type PipelineJobData = Record<string, unknown>;

type PlaceholderPipelineJobResult = {
  jobName: string;
  status: "pending_implementation";
};

export type PipelineJobResult = PlaceholderPipelineJobResult | SourceImportPipelineResult;

type PipelineProcessor = Processor<PipelineJobData, PipelineJobResult, JobName>;

async function placeholderHandler(job: Job<PipelineJobData, PipelineJobResult, JobName>): Promise<PipelineJobResult> {
  console.info(`[pipeline] placeholder handler invoked for ${job.name}`);

  return {
    jobName: job.name,
    status: "pending_implementation",
  };
}

export const pipelineHandlers = {
  [jobNames.sourceImport]: sourceImportHandler as PipelineProcessor,
  [jobNames.sourceFetch]: placeholderHandler,
  [jobNames.contentFetchHtml]: placeholderHandler,
  [jobNames.contentNormalize]: placeholderHandler,
  [jobNames.contentAnalyzeBasic]: placeholderHandler,
  [jobNames.contentAnalyzeHeavy]: placeholderHandler,
  [jobNames.digestCompose]: placeholderHandler,
  [jobNames.digestDeliver]: placeholderHandler,
} satisfies Record<JobName, PipelineProcessor>;
