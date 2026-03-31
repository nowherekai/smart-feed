import { Queue, type Processor, Worker } from "bullmq";
import IORedis from "ioredis";

import { defaultJobOptions, queueName, workerConcurrency } from "./config";
import { loadQueueEnv } from "./env";

let redisConnection: IORedis | null = null;
let cachedQueue: Queue<Record<string, unknown>, unknown> | null = null;

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

export function createQueue<TData = Record<string, unknown>, TResult = unknown>() {
  cachedQueue ??= new Queue(queueName, {
    connection: getRedisConnection(),
    defaultJobOptions,
  });

  return cachedQueue as Queue<TData, TResult>;
}

export function createWorker<
  TData = Record<string, unknown>,
  TResult = unknown,
  TName extends string = string,
>(processor: Processor<TData, TResult, TName>) {
  return new Worker<TData, TResult, TName>(queueName, processor, {
    connection: getRedisConnection(),
    concurrency: workerConcurrency,
  });
}

export async function closeRedisConnection() {
  if (!redisConnection) {
    return;
  }

  await redisConnection.quit();
  redisConnection = null;
}
