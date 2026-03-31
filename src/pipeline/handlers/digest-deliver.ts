/**
 * 摘要报告投递处理器模块
 * 负责将已生成的摘要报告通过 SMTP 邮件发送给配置的收件人。
 */

import type { Job } from "bullmq";
import type { JobName } from "../../queue";
import { type DigestDeliverJobData, type DigestDeliverPayload, runDigestDeliver } from "../../services/digest-delivery";
import { type DigestPipelineRuntimeDeps, executeDigestPipelineStep } from "../../services/digest-pipeline-runtime";
import type { PipelineStepExecutionResult, PipelineStepResult } from "../types";

/** 摘要投递流水线结果类型 */
export type DigestDeliverPipelineResult = PipelineStepExecutionResult<DigestDeliverPayload>;

/**
 * 创建摘要投递处理器
 * 使用摘要流水线运行时 (executeDigestPipelineStep) 执行投递步骤。
 * 核心逻辑由 services/digest-delivery 的 runDigestDeliver 实现。
 */
export function createDigestDeliverHandler(
  runDeliver: (jobData: DigestDeliverJobData) => Promise<PipelineStepResult<DigestDeliverPayload>> = runDigestDeliver,
  runtimeDeps?: DigestPipelineRuntimeDeps,
) {
  return async function digestDeliverHandler(
    job: Job<DigestDeliverJobData, DigestDeliverPipelineResult, JobName>,
  ): Promise<DigestDeliverPipelineResult> {
    return executeDigestPipelineStep({
      deps: runtimeDeps,
      jobData: job.data,
      jobName: job.name,
      // 从输入数据中解析出摘要 ID，用于关联流水线运行记录
      resolveDigestId(result) {
        return typeof result.jobData.digestId === "string" ? result.jobData.digestId : null;
      },
      runStep: runDeliver,
    });
  };
}

/** 默认导出的处理器实例 */
export const digestDeliverHandler = createDigestDeliverHandler();
