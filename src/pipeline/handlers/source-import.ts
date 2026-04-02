/**
 * 信息源导入处理器模块
 * 处理从外部（如手动输入或 OPML 文件）导入新的信息源。
 */

import type { Job } from "bullmq";

import type { SmartFeedTaskName } from "../../queue";
import { runSourceImport, type SourceImportJobData } from "../../services/source-import";
import { createLogger } from "../../utils";

/** 来源导入流水线结果类型 */
export type SourceImportPipelineResult = {
  jobName: string;
  /** 执行最终状态 */
  status: "completed" | "failed";
  /** 本次导入运行记录的 ID */
  importRunId: string;
  /** 导入模式：单条或批量 OPML */
  mode: "single" | "opml";
  /** 待处理的总数量 */
  totalCount: number;
  /** 成功创建的信息源数量 */
  createdCount: number;
  /** 因重复跳过的信息源数量 */
  skippedCount: number;
  /** 导入失败的数量 */
  failedCount: number;
};
const logger = createLogger("HandlerSourceImport");

/**
 * 来源导入处理器函数
 * 逻辑委托给 services/source-import 的 runSourceImport 实现。
 */
export async function sourceImportHandler(
  job: Job<SourceImportJobData, SourceImportPipelineResult, SmartFeedTaskName>,
): Promise<SourceImportPipelineResult> {
  logger.info("Handler started", {
    jobId: job.id,
    mode: job.data.mode,
  });
  const result = await runSourceImport(job.data);

  return {
    jobName: job.name,
    status: result.status,
    importRunId: result.importRunId,
    mode: result.mode,
    totalCount: result.totalCount,
    createdCount: result.createdCount,
    skippedCount: result.skippedCount,
    failedCount: result.failedCount,
  };
}
