/**
 * 队列连接管理模块
 * 负责 Redis 连接的建立、复用，以及 BullMQ Queue 和 Worker 实例的创建与关闭。
 */

import { type Processor, Queue, Worker, type WorkerOptions } from "bullmq";
import IORedis from "ioredis";

import {
  defaultJobOptions,
  legacyImportQueueName,
  type QueueName,
  queueNames,
  type SmartFeedTaskName,
  taskToQueueMap,
  workerConcurrencyMap,
} from "./config";
import { loadQueueEnv } from "./env";

// 内部单例缓存
let redisConnection: IORedis | null = null;
let legacyImportQueue: Queue<Record<string, unknown>, unknown, string> | null = null;
let queueRegistry: QueueRegistry | null = null;

export type QueueRegistry = {
  [K in QueueName]: Queue<Record<string, unknown>, unknown, string>;
};

/**
 * 获取共享的 Redis 连接单例
 * BullMQ 需要设置 maxRetriesPerRequest: null
 */
export function getRedisConnection(): IORedis {
  if (redisConnection) {
    return redisConnection;
  }

  const { redisUrl } = loadQueueEnv();

  redisConnection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  return redisConnection;
}

/**
 * 创建或获取 legacy import 兼容队列实例
 */
export function getLegacyImportQueue<TData = Record<string, unknown>, TResult = unknown>() {
  legacyImportQueue ??= new Queue(legacyImportQueueName, {
    connection: getRedisConnection(),
    defaultJobOptions,
  });

  return legacyImportQueue as Queue<TData, TResult, string>;
}

/**
 * 获取或创建全部职能队列实例
 */
export function getQueueRegistry(): QueueRegistry {
  if (queueRegistry) {
    return queueRegistry;
  }

  const connection = getRedisConnection();
  queueRegistry = Object.fromEntries(
    Object.values(queueNames).map((queueName) => [
      queueName,
      new Queue(queueName, {
        connection,
        defaultJobOptions,
      }),
    ]),
  ) as QueueRegistry;

  return queueRegistry;
}

/**
 * 根据任务类型获取对应的职能队列
 */
export function getQueueForTask<TData = Record<string, unknown>, TResult = unknown>(taskName: SmartFeedTaskName) {
  if (taskName === "source.import") {
    throw new Error('[queue] Task "source.import" must use legacy import queue.');
  }

  const targetQueueName = taskToQueueMap[taskName];

  return getQueueRegistry()[targetQueueName] as Queue<TData, TResult, string>;
}

/**
 * 创建一个新的 BullMQ Worker 实例
 */
export function createWorker<TData = Record<string, unknown>, TResult = unknown, TName extends string = string>(
  queueName: QueueName | typeof legacyImportQueueName,
  processor: Processor<TData, TResult, TName>,
  options: Partial<WorkerOptions> = {},
) {
  return new Worker<TData, TResult, TName>(queueName, processor, {
    connection: getRedisConnection(),
    concurrency: queueName === legacyImportQueueName ? 1 : workerConcurrencyMap[queueName],
    ...options,
  });
}

/**
 * 关闭全部职能队列实例
 */
export async function closeAllQueues() {
  if (!queueRegistry) {
    return;
  }

  await Promise.all(Object.values(queueRegistry).map((queue) => queue.close()));
  queueRegistry = null;
}

/**
 * 关闭 legacy import 兼容队列
 */
export async function closeLegacyImportQueue() {
  if (!legacyImportQueue) {
    return;
  }

  await legacyImportQueue.close();
  legacyImportQueue = null;
}

/**
 * 断开 Redis 连接
 */
export async function closeRedisConnection() {
  if (!redisConnection) {
    return;
  }

  await redisConnection.quit();
  redisConnection = null;
}
