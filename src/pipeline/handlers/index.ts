/**
 * 流水线处理器注册模块
 * 负责将所有的任务处理函数 (Handlers) 映射到其对应的任务名称 (JobNames)。
 */

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

/** 流水线任务数据通用类型 */
export type PipelineJobData = Record<string, unknown>;

/** 流水线任务结果联合类型 */
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

/** 处理器函数类型 */
type PipelineProcessor = Processor<PipelineJobData, PipelineJobResult, JobName>;

/**
 * 全局流水线处理器映射表
 * 定义了 Worker 在收到特定 JobName 时应该调用哪个 Handler。
 */
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
