/**
 * 内容标准化处理器模块
 * 负责将原始 HTML 内容转换为清洗后的 Markdown 格式。
 */

import type { Job } from "bullmq";
import type { SmartFeedTaskName } from "../../queue";
import {
  type ContentNormalizeJobData,
  type ContentNormalizePayload,
  runContentNormalize,
} from "../../services/content";
import { type ContentPipelineRuntimeDeps, executeContentPipelineStep } from "../../services/pipeline-runtime";
import type { PipelineStepExecutionResult } from "../types";

/** 标准化任务流水线结果类型 */
export type ContentNormalizePipelineResult = PipelineStepExecutionResult<ContentNormalizePayload>;

/**
 * 创建内容标准化处理器
 * 使用通用内容流水线运行时 (executeContentPipelineStep) 执行标准化步骤。
 * 核心逻辑由 services/content 的 runContentNormalize 实现。
 */
export function createContentNormalizeHandler(
  runNormalize: (jobData: ContentNormalizeJobData) => ReturnType<typeof runContentNormalize> = runContentNormalize,
  runtimeDeps?: ContentPipelineRuntimeDeps,
) {
  return async function contentNormalizeHandler(
    job: Job<ContentNormalizeJobData, ContentNormalizePipelineResult, SmartFeedTaskName>,
  ): Promise<ContentNormalizePipelineResult> {
    return executeContentPipelineStep({
      deps: runtimeDeps,
      jobData: job.data,
      jobName: job.name,
      runStep: runNormalize,
    });
  };
}

/** 默认导出的处理器实例 */
export const contentNormalizeHandler = createContentNormalizeHandler();
