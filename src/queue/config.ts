/**
 * 消息队列配置模块
 * 定义队列名称、任务名称、重试策略、并发度等核心参数。
 */

import type { DefaultJobOptions } from "bullmq";

/** legacy import 兼容队列名称，仅供 source.import 使用 */
export const legacyImportQueueName = "smart-feed";

/** 多 worker 职能队列名称 */
export const queueNames = {
  sourceDispatch: "source-dispatch-queue",
  ingestion: "ingestion-queue",
  content: "content-queue",
  ai: "ai-queue",
  digest: "digest-queue",
} as const;

export type QueueName = (typeof queueNames)[keyof typeof queueNames];

/**
 * 项目内任务名称映射表
 * 所有在流水线中流转的任务类型都在此定义。
 */
export const smartFeedTaskNames = {
  /** 调度器源同步任务 */
  schedulerSourcesSync: "scheduler.sources.sync",
  /** 来源导入任务 */
  sourceImport: "source.import",
  /** 来源抓取任务 */
  sourceFetch: "source.fetch",
  /** HTML 抓取任务 */
  contentFetchHtml: "content.fetch-html",
  /** 内容标准化任务 (HTML -> Markdown) */
  contentNormalize: "content.normalize",
  /** 基础分析任务 (轻量 AI 分析) */
  contentAnalyzeBasic: "content.analyze.basic",
  /** 深度摘要任务 (重型 AI 摘要) */
  contentAnalyzeHeavy: "content.analyze.heavy",
  /** 摘要编排任务 */
  digestCompose: "digest.compose",
  /** 摘要投递任务 */
  digestDeliver: "digest.deliver",
} as const;

export type SmartFeedTaskName = (typeof smartFeedTaskNames)[keyof typeof smartFeedTaskNames];

/** 任务类型到职能队列的映射，source.import 继续走 legacy queue */
export const taskToQueueMap: Record<Exclude<SmartFeedTaskName, "source.import">, QueueName> = {
  [smartFeedTaskNames.schedulerSourcesSync]: queueNames.sourceDispatch,
  [smartFeedTaskNames.sourceFetch]: queueNames.ingestion,
  [smartFeedTaskNames.contentFetchHtml]: queueNames.content,
  [smartFeedTaskNames.contentNormalize]: queueNames.content,
  [smartFeedTaskNames.contentAnalyzeBasic]: queueNames.ai,
  [smartFeedTaskNames.contentAnalyzeHeavy]: queueNames.ai,
  [smartFeedTaskNames.digestCompose]: queueNames.digest,
  [smartFeedTaskNames.digestDeliver]: queueNames.digest,
};

/**
 * 构建来源抓取任务的去重 ID
 * 确保同一个来源在同一时间只有一个抓取任务在队列中。
 */
export function buildSourceFetchDeduplicationId(sourceId: string): string {
  return `${smartFeedTaskNames.sourceFetch}:${sourceId}`;
}

/**
 * 默认的任务配置
 * - 尝试 3 次
 * - 指数退避重试 (初始延迟 1s)
 * - 保留最近 100 个成功任务，500 个失败任务
 */
export const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1_000,
  },
  removeOnComplete: 100,
  removeOnFail: 500,
} satisfies DefaultJobOptions;

/** 各职能队列初始并发度 */
export const workerConcurrencyMap: Record<QueueName, number> = {
  [queueNames.sourceDispatch]: 1,
  [queueNames.ingestion]: 2,
  [queueNames.content]: 5,
  [queueNames.ai]: 1,
  [queueNames.digest]: 1,
};
