/**
 * 队列连接管理模块
 * 负责 Redis 连接的建立、复用，以及 BullMQ Queue 和 Worker 实例的创建与关闭。
 */

import { type Processor, Queue, Worker } from "bullmq";
import IORedis from "ioredis";

import { defaultJobOptions, queueName, workerConcurrency } from "./config";
import { loadQueueEnv } from "./env";

// 内部单例缓存
let redisConnection: IORedis | null = null;
let cachedQueue: Queue<Record<string, unknown>, unknown, string> | null = null;

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
 * 创建或获取共享的 BullMQ 队列实例
 */
export function createQueue<TData = Record<string, unknown>, TResult = unknown>() {
  cachedQueue ??= new Queue(queueName, {
    connection: getRedisConnection(),
    defaultJobOptions,
  });

  return cachedQueue as Queue<TData, TResult, string>;
}

/**
 * 创建一个新的 BullMQ Worker 实例
 */
export function createWorker<TData = Record<string, unknown>, TResult = unknown, TName extends string = string>(
  processor: Processor<TData, TResult, TName>,
) {
  return new Worker<TData, TResult, TName>(queueName, processor, {
    connection: getRedisConnection(),
    concurrency: workerConcurrency,
  });
}

/**
 * 关闭队列实例
 */
export async function closeQueue() {
  if (!cachedQueue) {
    return;
  }

  await cachedQueue.close();
  cachedQueue = null;
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
