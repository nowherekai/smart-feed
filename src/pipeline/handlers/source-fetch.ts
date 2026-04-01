/**
 * 来源抓取处理器模块
 * 处理单个信息源的内容抓取，如解析 RSS/Atom Feed 提取最新文章。
 */

import type { Job } from "bullmq";

import type { SmartFeedTaskName } from "../../queue";
import { runSourceFetch, type SourceFetchJobData, type SourceFetchSummary } from "../../services/content";

/** 来源抓取任务结果类型 */
export type SourceFetchPipelineResult = SourceFetchSummary & {
  jobName: string;
};

/**
 * 创建来源抓取处理器
 * 核心抓取逻辑由 services/content 的 runSourceFetch 实现。
 */
export function createSourceFetchHandler(
  runFetch: (jobData: SourceFetchJobData) => Promise<SourceFetchSummary> = runSourceFetch,
) {
  return async function sourceFetchHandler(
    job: Job<SourceFetchJobData, SourceFetchPipelineResult, SmartFeedTaskName>,
  ): Promise<SourceFetchPipelineResult> {
    // 1. 执行抓取操作
    const result = await runFetch(job.data);

    // 2. 返回包含抓取结果统计的总结
    return {
      ...result,
      jobName: job.name,
    };
  };
}

/** 默认导出的处理器实例 */
export const sourceFetchHandler = createSourceFetchHandler();
