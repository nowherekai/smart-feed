/**
 * 摘要报告编排处理器模块
 * 负责收集统计窗口内的高价值内容分析记录，并将其编排成 Markdown 格式的摘要报告。
 */

import type { Job } from "bullmq";
import type { SmartFeedTaskName } from "../../queue";
import { type DigestComposeJobData, type DigestComposePayload, runDigestCompose } from "../../services/digest";
import { type DigestPipelineRuntimeDeps, executeDigestPipelineStep } from "../../services/digest-pipeline-runtime";
import type { PipelineStepExecutionResult, PipelineStepResult } from "../types";

/** 摘要编排流水线结果类型 */
export type DigestComposePipelineResult = PipelineStepExecutionResult<DigestComposePayload>;

/**
 * 创建摘要编排处理器
 * 使用摘要流水线运行时 (executeDigestPipelineStep) 执行编排步骤。
 * 核心逻辑由 services/digest 的 runDigestCompose 实现。
 */
export function createDigestComposeHandler(
  runCompose: (jobData: DigestComposeJobData) => Promise<PipelineStepResult<DigestComposePayload>> = runDigestCompose,
  runtimeDeps?: DigestPipelineRuntimeDeps,
) {
  return async function digestComposeHandler(
    job: Job<DigestComposeJobData, DigestComposePipelineResult, SmartFeedTaskName>,
  ): Promise<DigestComposePipelineResult> {
    return executeDigestPipelineStep({
      deps: runtimeDeps,
      jobData: job.data,
      jobName: job.name,
      // 从执行结果中解析出生成的摘要报告 ID，用于流水线记录
      resolveDigestId(result) {
        return typeof result.payload?.digestId === "string" ? result.payload.digestId : null;
      },
      runStep: runCompose,
    });
  };
}

/** 默认导出的处理器实例 */
export const digestComposeHandler = createDigestComposeHandler();
