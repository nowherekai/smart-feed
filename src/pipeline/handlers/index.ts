import type { Processor } from "bullmq";

import { type JobName, jobNames } from "../../queue";
import { type ContentAnalyzeBasicPipelineResult, contentAnalyzeBasicHandler } from "./content-analyze-basic";
import { type ContentAnalyzeHeavyPipelineResult, contentAnalyzeHeavyHandler } from "./content-analyze-heavy";
import { type ContentFetchHtmlPipelineResult, contentFetchHtmlHandler } from "./content-fetch-html";
import { type ContentNormalizePipelineResult, contentNormalizeHandler } from "./content-normalize";
import { type DigestComposePipelineResult, digestComposeHandler } from "./digest-compose";
import { type DigestDeliverPipelineResult, digestDeliverHandler } from "./digest-deliver";
import { type SchedulerSourcesSyncPipelineResult, schedulerSourcesSyncHandler } from "./scheduler-sources-sync";
import { type SourceFetchPipelineResult, sourceFetchHandler } from "./source-fetch";
import { type SourceImportPipelineResult, sourceImportHandler } from "./source-import";

export type PipelineJobData = Record<string, unknown>;

export type PipelineJobResult =
  | SchedulerSourcesSyncPipelineResult
  | SourceImportPipelineResult
  | SourceFetchPipelineResult
  | ContentFetchHtmlPipelineResult
  | ContentNormalizePipelineResult
  | ContentAnalyzeBasicPipelineResult
  | ContentAnalyzeHeavyPipelineResult
  | DigestComposePipelineResult
  | DigestDeliverPipelineResult;

type PipelineProcessor = Processor<PipelineJobData, PipelineJobResult, JobName>;

export const pipelineHandlers = {
  [jobNames.schedulerSourcesSync]: schedulerSourcesSyncHandler as PipelineProcessor,
  [jobNames.sourceImport]: sourceImportHandler as PipelineProcessor,
  [jobNames.sourceFetch]: sourceFetchHandler as PipelineProcessor,
  [jobNames.contentFetchHtml]: contentFetchHtmlHandler as PipelineProcessor,
  [jobNames.contentNormalize]: contentNormalizeHandler as PipelineProcessor,
  [jobNames.contentAnalyzeBasic]: contentAnalyzeBasicHandler as PipelineProcessor,
  [jobNames.contentAnalyzeHeavy]: contentAnalyzeHeavyHandler as PipelineProcessor,
  [jobNames.digestCompose]: digestComposeHandler as PipelineProcessor,
  [jobNames.digestDeliver]: digestDeliverHandler as PipelineProcessor,
} satisfies Record<JobName, PipelineProcessor>;
