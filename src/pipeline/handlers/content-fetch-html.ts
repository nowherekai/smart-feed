/**
 * 内容 HTML 抓取处理器模块
 * 负责抓取文章的全文 HTML 内容。
 */

import type { Job } from "bullmq";
import type { JobName } from "../../queue";
import {
  type ContentFetchHtmlJobData,
  type ContentFetchHtmlPayload,
  runContentFetchHtml,
} from "../../services/content";
import { type ContentPipelineRuntimeDeps, executeContentPipelineStep } from "../../services/pipeline-runtime";
import type { PipelineStepExecutionResult } from "../types";

/** HTML 抓取流水线结果类型 */
export type ContentFetchHtmlPipelineResult = PipelineStepExecutionResult<ContentFetchHtmlPayload>;

/**
 * 创建 HTML 抓取处理器
 * 使用通用内容流水线运行时 (executeContentPipelineStep) 执行抓取步骤。
 * 核心逻辑由 services/content 的 runContentFetchHtml 实现。
 */
export function createContentFetchHtmlHandler(
  runFetchHtml: (jobData: ContentFetchHtmlJobData) => ReturnType<typeof runContentFetchHtml> = runContentFetchHtml,
  runtimeDeps?: ContentPipelineRuntimeDeps,
) {
  return async function contentFetchHtmlHandler(
    job: Job<ContentFetchHtmlJobData, ContentFetchHtmlPipelineResult, JobName>,
  ): Promise<ContentFetchHtmlPipelineResult> {
    return executeContentPipelineStep({
      deps: runtimeDeps,
      jobData: job.data,
      jobName: job.name,
      runStep: runFetchHtml,
    });
  };
}

/** 默认导出的处理器实例 */
export const contentFetchHtmlHandler = createContentFetchHtmlHandler();
