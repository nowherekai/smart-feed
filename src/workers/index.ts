/**
 * Worker 进程入口模块
 * 负责启动 BullMQ Worker、定时调度器，并处理进程的优雅停机（Graceful Shutdown）。
 */

import type { Job, Worker } from "bullmq";

import { type PipelineJobData, type PipelineJobResult, pipelineHandlers } from "../pipeline";
import {
  closeLegacyImportQueue,
  closeRedisConnection,
  createWorker,
  legacyImportQueueName,
  type QueueName,
  queueNames,
  type SmartFeedTaskName,
  smartFeedTaskNames,
} from "../queue";
import { startScheduler, stopScheduler } from "../scheduler";
import { startWorkerBullBoard, type WorkerBullBoardServer } from "./bull-board";

/** Worker 应用实例类型子集 */
type AppWorker = Pick<Worker<PipelineJobData, PipelineJobResult, SmartFeedTaskName>, "close" | "on">;

/** Worker 创建工厂函数类型 */
type WorkerFactory = (
  queueName: QueueName | typeof legacyImportQueueName,
  processor: (job: Job<PipelineJobData, PipelineJobResult, SmartFeedTaskName>) => Promise<PipelineJobResult>,
) => AppWorker;

/** 进程接口子集，方便测试注入 */
type ProcessLike = {
  exit: (code: number) => never | undefined;
  once: (event: "SIGINT" | "SIGTERM", listener: () => void) => void;
};

/** 日志接口子集 */
type LoggerLike = Pick<typeof console, "error" | "info">;

/** 应用启动依赖项 */
export type WorkerAppDeps = {
  closeLegacyImportQueue?: () => Promise<void>;
  closeRedisConnection?: () => Promise<void>;
  createWorker?: WorkerFactory;
  exit?: (code: number) => never | undefined;
  logger?: LoggerLike;
  process?: ProcessLike;
  startBullBoard?: () => Promise<WorkerBullBoardServer>;
  startScheduler?: () => Promise<void>;
  stopScheduler?: () => Promise<void>;
};

/** 启动后的应用对象 */
export type WorkerApp = {
  bullBoard: WorkerBullBoardServer | null;
  shutdown: (signal: string) => Promise<void>;
  workers: AppWorker[];
};

/**
 * 根据 Job 名称查找对应的 Pipeline Handler
 */
function getHandler(jobName: string) {
  const handler = pipelineHandlers[jobName as SmartFeedTaskName];

  if (!handler) {
    throw new Error(`[worker] Unsupported job "${jobName}".`);
  }

  return handler;
}

/**
 * 启动 Worker 应用主逻辑
 * 1. 初始化 Worker
 * 2. 注册任务处理器 (Processor)
 * 3. 启动定时调度器
 * 4. 监听 SIGINT/SIGTERM 实现优雅停机
 */
export async function startWorkerApp(deps: WorkerAppDeps = {}): Promise<WorkerApp> {
  const logger = deps.logger ?? console;
  const processLike = deps.process ?? process;
  const exit = deps.exit ?? ((code: number) => process.exit(code));
  const createAppWorker = deps.createWorker ?? createWorker;
  const closeLegacyQueue = deps.closeLegacyImportQueue ?? closeLegacyImportQueue;
  const startBullBoard = deps.startBullBoard ?? startWorkerBullBoard;
  const startAppScheduler = deps.startScheduler ?? startScheduler;
  const stopAppScheduler = deps.stopScheduler ?? stopScheduler;
  const closeRedis = deps.closeRedisConnection ?? closeRedisConnection;

  logger.info("[worker] Starting smart-feed worker...");

  const makeProcessor =
    (allowedTaskNames: ReadonlySet<SmartFeedTaskName>) =>
    async (job: Job<PipelineJobData, PipelineJobResult, SmartFeedTaskName>): Promise<PipelineJobResult> => {
      if (!allowedTaskNames.has(job.name)) {
        throw new Error(`[worker] Task "${job.name}" is not handled by this worker.`);
      }

      const handler = getHandler(job.name);
      return handler(job);
    };

  const workers = [
    createAppWorker(queueNames.sourceDispatch, makeProcessor(new Set([smartFeedTaskNames.schedulerSourcesSync]))),
    createAppWorker(queueNames.ingestion, makeProcessor(new Set([smartFeedTaskNames.sourceFetch]))),
    createAppWorker(
      queueNames.content,
      makeProcessor(new Set([smartFeedTaskNames.contentFetchHtml, smartFeedTaskNames.contentNormalize])),
    ),
    createAppWorker(
      queueNames.ai,
      makeProcessor(new Set([smartFeedTaskNames.contentAnalyzeBasic, smartFeedTaskNames.contentAnalyzeHeavy])),
    ),
    createAppWorker(
      queueNames.digest,
      makeProcessor(new Set([smartFeedTaskNames.digestCompose, smartFeedTaskNames.digestDeliver])),
    ),
    createAppWorker(legacyImportQueueName, makeProcessor(new Set([smartFeedTaskNames.sourceImport]))),
  ];
  let bullBoard: WorkerBullBoardServer | null = null;

  for (const worker of workers) {
    worker.on("ready", () => {
      logger.info("[worker] Worker is ready.");
    });

    worker.on("failed", (job, error) => {
      logger.error(`[worker] Job ${job?.id ?? "unknown"} failed.`, error);
    });
  }

  try {
    // 启动调度器（注册定时任务）
    await startAppScheduler();
    bullBoard = await startBullBoard();
  } catch (error) {
    await Promise.allSettled(workers.map((worker) => worker.close()));
    await stopAppScheduler().catch(() => undefined);
    await closeLegacyQueue().catch(() => undefined);
    await closeRedis().catch(() => undefined);
    throw error;
  }

  /**
   * 优雅停机逻辑
   */
  const shutdown = async (signal: string) => {
    logger.info(`[worker] Received ${signal}, shutting down...`);
    await bullBoard?.close();
    await Promise.all(workers.map((worker) => worker.close()));
    await stopAppScheduler();
    await closeLegacyQueue();
    await closeRedis();
    exit(0);
  };

  // 监听进程中断信号
  processLike.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  processLike.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  return {
    bullBoard,
    shutdown,
    workers,
  };
}

/**
 * 主入口函数
 */
async function main() {
  await startWorkerApp();
}

// 仅在直接运行时执行 (Bun 兼容方式)
if (import.meta.main) {
  void main().catch(async (error) => {
    console.error("[worker] Failed to start worker.", error);
    await stopScheduler().catch(() => undefined);
    await closeLegacyImportQueue().catch(() => undefined);
    await closeRedisConnection();
    process.exit(1);
  });
}
