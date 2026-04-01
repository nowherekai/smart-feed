/**
 * 全局来源同步处理器模块
 * 由调度器定时触发，负责扫描所有活跃的信息源并为每个来源生成抓取任务。
 */

import type { Job, Queue } from "bullmq";

import {
  buildSourceFetchDeduplicationId,
  getQueueForTask,
  type SmartFeedTaskName,
  smartFeedTaskNames,
} from "../../queue";
import type { SourceFetchJobData } from "../../services/content";
import { listSourceIdsDueForSync } from "../../services/source";
import { logger } from "../../utils";

/** 调度同步任务输入数据类型 */
export type SchedulerSourcesSyncJobData = {
  trigger: "scheduler";
};

/** 调度同步任务结果类型 */
export type SchedulerSourcesSyncPipelineResult = {
  jobName: string;
  /** 成功入队的抓取任务数量 */
  queuedSourceCount: number;
  /** 扫描到的活跃来源总数 */
  scannedSourceCount: number;
};

/** 处理器依赖项 */
export type SchedulerSourcesSyncDeps = {
  getSourceFetchQueue?: () => Queue<SourceFetchJobData, unknown, string>;
  listSourceIdsDueForSync?: () => Promise<string[]>;
};

/**
 * 将单个来源的抓取任务入队，包含去重逻辑
 * 确保同一时间同一来源只有一个抓取任务在进行
 */
async function enqueueSourceFetch(
  queue: Queue<SourceFetchJobData, unknown, string>,
  sourceId: string,
): Promise<boolean> {
  const deduplicationId = buildSourceFetchDeduplicationId(sourceId);
  const existingJobId = await queue.getDeduplicationJobId(deduplicationId);

  // 如果已经存在该来源的任务，跳过入队
  if (existingJobId) {
    return false;
  }

  await queue.add(
    smartFeedTaskNames.sourceFetch,
    {
      sourceId,
      trigger: "scheduler",
    },
    {
      deduplication: {
        id: deduplicationId,
      },
    },
  );

  return true;
}

/**
 * 创建调度同步任务处理器
 */
export function createSchedulerSourcesSyncHandler(deps: SchedulerSourcesSyncDeps = {}) {
  const getDueSourceIds = deps.listSourceIdsDueForSync ?? listSourceIdsDueForSync;
  const getSourceFetchQueue =
    deps.getSourceFetchQueue ?? (() => getQueueForTask<SourceFetchJobData>(smartFeedTaskNames.sourceFetch));

  return async function schedulerSourcesSyncHandler(
    job: Job<SchedulerSourcesSyncJobData, SchedulerSourcesSyncPipelineResult, SmartFeedTaskName>,
  ): Promise<SchedulerSourcesSyncPipelineResult> {
    logger.info(`[handler] ${job.name} started`, { jobId: job.id });
    // 1. 获取当前调度周期内需要同步的来源 ID
    const sourceIds = await getDueSourceIds();
    const queue = getSourceFetchQueue();

    // 2. 逐个将来源抓取任务入队（使用 Promise.all 并行处理）
    const enqueueResults = await Promise.all(sourceIds.map((sourceId) => enqueueSourceFetch(queue, sourceId)));
    const queuedSourceCount = enqueueResults.filter(Boolean).length;

    // 3. 返回执行汇总
    return {
      jobName: job.name,
      queuedSourceCount,
      scannedSourceCount: sourceIds.length,
    };
  };
}

/** 默认导出的处理器实例 */
export const schedulerSourcesSyncHandler = createSchedulerSourcesSyncHandler();
