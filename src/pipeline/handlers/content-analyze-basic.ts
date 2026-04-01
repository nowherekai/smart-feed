/**
 * 内容基础分析处理器模块
 * 负责调用 AI 进行轻量级分析，如分类、关键词提取和初步价值评分。
 */

import type { Job } from "bullmq";
import type { SmartFeedTaskName } from "../../queue";
import { type ContentAnalyzeBasicPayload, runContentAnalyzeBasic } from "../../services/analysis";
import type { ContentAnalyzeBasicJobData } from "../../services/content";
import { type ContentPipelineRuntimeDeps, executeContentPipelineStep } from "../../services/pipeline-runtime";
import type { PipelineStepExecutionResult } from "../types";

/** 基础分析流水线结果类型 */
export type ContentAnalyzeBasicPipelineResult = PipelineStepExecutionResult<ContentAnalyzeBasicPayload>;

/**
 * 创建内容基础分析处理器
 * 使用通用内容流水线运行时 (executeContentPipelineStep) 执行分析步骤。
 * 核心逻辑由 services/analysis 的 runContentAnalyzeBasic 实现。
 */
export function createContentAnalyzeBasicHandler(
  runAnalyzeBasic: (
    jobData: ContentAnalyzeBasicJobData,
  ) => ReturnType<typeof runContentAnalyzeBasic> = runContentAnalyzeBasic,
  runtimeDeps?: ContentPipelineRuntimeDeps,
) {
  return async function contentAnalyzeBasicHandler(
    job: Job<ContentAnalyzeBasicJobData, ContentAnalyzeBasicPipelineResult, SmartFeedTaskName>,
  ): Promise<ContentAnalyzeBasicPipelineResult> {
    return executeContentPipelineStep({
      deps: runtimeDeps,
      jobData: job.data,
      jobName: job.name,
      runStep: runAnalyzeBasic,
    });
  };
}

/** 默认导出的处理器实例 */
export const contentAnalyzeBasicHandler = createContentAnalyzeBasicHandler();
