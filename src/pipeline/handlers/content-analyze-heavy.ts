/**
 * 内容深度分析处理器模块
 * 负责调用重型 AI 模型生成详细摘要、关注理由和证据片段。
 */

import type { Job } from "bullmq";
import type { SmartFeedTaskName } from "../../queue";
import { type ContentAnalyzeHeavyPayload, runContentAnalyzeHeavy } from "../../services/analysis";
import type { ContentAnalyzeHeavyJobData } from "../../services/content";
import { type ContentPipelineRuntimeDeps, executeContentPipelineStep } from "../../services/pipeline-runtime";
import type { PipelineStepExecutionResult } from "../types";

/** 深度分析流水线结果类型 */
export type ContentAnalyzeHeavyPipelineResult = PipelineStepExecutionResult<ContentAnalyzeHeavyPayload>;

/**
 * 创建内容深度分析处理器
 * 使用通用内容流水线运行时 (executeContentPipelineStep) 执行分析步骤。
 * 核心逻辑由 services/analysis 的 runContentAnalyzeHeavy 实现。
 */
export function createContentAnalyzeHeavyHandler(
  runAnalyzeHeavy: (
    jobData: ContentAnalyzeHeavyJobData,
  ) => ReturnType<typeof runContentAnalyzeHeavy> = runContentAnalyzeHeavy,
  runtimeDeps?: ContentPipelineRuntimeDeps,
) {
  return async function contentAnalyzeHeavyHandler(
    job: Job<ContentAnalyzeHeavyJobData, ContentAnalyzeHeavyPipelineResult, SmartFeedTaskName>,
  ): Promise<ContentAnalyzeHeavyPipelineResult> {
    return executeContentPipelineStep({
      deps: runtimeDeps,
      jobData: job.data,
      jobName: job.name,
      runStep: runAnalyzeHeavy,
    });
  };
}

/** 默认导出的处理器实例 */
export const contentAnalyzeHeavyHandler = createContentAnalyzeHeavyHandler();
