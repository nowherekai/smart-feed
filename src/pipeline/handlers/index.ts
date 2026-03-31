import type { Job, Processor } from "bullmq";

import { type JobName, jobNames } from "../../queue";
import { type ContentAnalyzeBasicPipelineResult, contentAnalyzeBasicHandler } from "./content-analyze-basic";
import { type ContentAnalyzeHeavyPipelineResult, contentAnalyzeHeavyHandler } from "./content-analyze-heavy";
import { type ContentFetchHtmlPipelineResult, contentFetchHtmlHandler } from "./content-fetch-html";
import { type ContentNormalizePipelineResult, contentNormalizeHandler } from "./content-normalize";
import { type SourceFetchPipelineResult, sourceFetchHandler } from "./source-fetch";
import { type SourceImportPipelineResult, sourceImportHandler } from "./source-import";

export type PipelineJobData = Record<string, unknown>;

type PlaceholderPipelineJobResult = {
  jobName: string;
  status: "pending_implementation";
};

export type PipelineJobResult =
  | PlaceholderPipelineJobResult
  | SourceImportPipelineResult
  | SourceFetchPipelineResult
  | ContentFetchHtmlPipelineResult
  | ContentNormalizePipelineResult
  | ContentAnalyzeBasicPipelineResult
  | ContentAnalyzeHeavyPipelineResult;

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
  [jobNames.sourceFetch]: sourceFetchHandler as PipelineProcessor,
  [jobNames.contentFetchHtml]: contentFetchHtmlHandler as PipelineProcessor,
  [jobNames.contentNormalize]: contentNormalizeHandler as PipelineProcessor,
  [jobNames.contentAnalyzeBasic]: contentAnalyzeBasicHandler as PipelineProcessor,
  [jobNames.contentAnalyzeHeavy]: contentAnalyzeHeavyHandler as PipelineProcessor,
  [jobNames.digestCompose]: placeholderHandler,
  [jobNames.digestDeliver]: placeholderHandler,
} satisfies Record<JobName, PipelineProcessor>;
