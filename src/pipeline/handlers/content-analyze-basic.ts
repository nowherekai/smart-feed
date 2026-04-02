/**
 * 内容基础分析处理器模块
 * 负责调用 AI 进行轻量级分析，如分类、关键词提取和初步价值评分。
 */

import type { Job } from "bullmq";
import type { SmartFeedTaskName } from "../../queue";
import { type ContentAnalyzeBasicPayload, runContentAnalyzeBasic } from "../../services/analysis";
import type { ContentAnalyzeBasicJobData } from "../../services/content";
import { type ContentPipelineRuntimeDeps, executeContentPipelineStep } from "../../services/pipeline-runtime";
import { logger } from "../../utils";
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
    logger.info(`[handler] ${job.name} started`, {
      attemptsMade: job.attemptsMade,
      contentId: job.data.contentId,
      jobId: job.id,
      pipelineRunId: job.data.pipelineRunId,
      queueName: job.queueName,
      trigger: job.data.trigger,
    });

    try {
      const result = await executeContentPipelineStep({
        deps: runtimeDeps,
        jobData: job.data,
        jobName: job.name,
        runStep: runAnalyzeBasic,
      });

      logger.info(`[handler] ${job.name} completed`, {
        attemptsMade: job.attemptsMade,
        contentId: job.data.contentId,
        jobId: job.id,
        nextStepQueued: result.nextStepQueued,
        outcome: result.outcome,
        pipelineRunId: result.pipelineRunId,
        status: result.status,
      });

      return result;
    } catch (error) {
      logger.error(`[handler] ${job.name} failed`, {
        attemptsMade: job.attemptsMade,
        contentId: job.data.contentId,
        error: error instanceof Error ? error.message : "Unknown handler error.",
        jobId: job.id,
        pipelineRunId: job.data.pipelineRunId,
      });
      throw error;
    }
  };
}

/** 默认导出的处理器实例 */
export const contentAnalyzeBasicHandler = createContentAnalyzeBasicHandler();
