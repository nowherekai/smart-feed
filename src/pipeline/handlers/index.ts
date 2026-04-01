/**
 * 流水线处理器注册模块
 * 负责将所有处理器映射到其对应的任务类型。
 */

import type { Processor } from "bullmq";

import { type SmartFeedTaskName, smartFeedTaskNames } from "../../queue";
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
type PipelineProcessor = Processor<PipelineJobData, PipelineJobResult, SmartFeedTaskName>;

/**
 * 全局流水线处理器映射表
 * 定义了 Worker 在收到特定任务类型时应该调用哪个 Handler。
 */
export const pipelineHandlers = {
  [smartFeedTaskNames.schedulerSourcesSync]: schedulerSourcesSyncHandler as PipelineProcessor,
  [smartFeedTaskNames.sourceImport]: sourceImportHandler as PipelineProcessor,
  [smartFeedTaskNames.sourceFetch]: sourceFetchHandler as PipelineProcessor,
  [smartFeedTaskNames.contentFetchHtml]: contentFetchHtmlHandler as PipelineProcessor,
  [smartFeedTaskNames.contentNormalize]: contentNormalizeHandler as PipelineProcessor,
  [smartFeedTaskNames.contentAnalyzeBasic]: contentAnalyzeBasicHandler as PipelineProcessor,
  [smartFeedTaskNames.contentAnalyzeHeavy]: contentAnalyzeHeavyHandler as PipelineProcessor,
  [smartFeedTaskNames.digestCompose]: digestComposeHandler as PipelineProcessor,
  [smartFeedTaskNames.digestDeliver]: digestDeliverHandler as PipelineProcessor,
} satisfies Record<SmartFeedTaskName, PipelineProcessor>;
