import type { Job, Worker } from "bullmq";

import { type PipelineJobData, type PipelineJobResult, pipelineHandlers } from "../pipeline";
import { closeRedisConnection, createWorker, type JobName } from "../queue";
import { startScheduler, stopScheduler } from "../scheduler";

type AppWorker = Pick<Worker<PipelineJobData, PipelineJobResult, JobName>, "close" | "on">;

type WorkerFactory = (
  processor: (job: Job<PipelineJobData, PipelineJobResult, JobName>) => Promise<PipelineJobResult>,
) => AppWorker;

type ProcessLike = {
  exit: (code: number) => never | undefined;
  once: (event: "SIGINT" | "SIGTERM", listener: () => void) => void;
};

type LoggerLike = Pick<typeof console, "error" | "info">;

export type WorkerAppDeps = {
  closeRedisConnection?: () => Promise<void>;
  createWorker?: WorkerFactory;
  exit?: (code: number) => never | undefined;
  logger?: LoggerLike;
  process?: ProcessLike;
  startScheduler?: () => Promise<void>;
  stopScheduler?: () => Promise<void>;
};

export type WorkerApp = {
  shutdown: (signal: string) => Promise<void>;
  worker: AppWorker;
};

function getHandler(jobName: string) {
  const handler = pipelineHandlers[jobName as JobName];

  if (!handler) {
    throw new Error(`[worker] Unsupported job "${jobName}".`);
  }

  return handler;
}

export async function startWorkerApp(deps: WorkerAppDeps = {}): Promise<WorkerApp> {
  const logger = deps.logger ?? console;
  const processLike = deps.process ?? process;
  const exit = deps.exit ?? ((code: number) => process.exit(code));
  const createAppWorker = deps.createWorker ?? createWorker;
  const startAppScheduler = deps.startScheduler ?? startScheduler;
  const stopAppScheduler = deps.stopScheduler ?? stopScheduler;
  const closeRedis = deps.closeRedisConnection ?? closeRedisConnection;

  logger.info("[worker] Starting smart-feed worker...");

  const worker = createAppWorker(
    async (job: Job<PipelineJobData, PipelineJobResult, JobName>): Promise<PipelineJobResult> => {
      const handler = getHandler(job.name);
      return handler(job);
    },
  );

  worker.on("ready", () => {
    logger.info("[worker] Worker is ready.");
  });

  worker.on("failed", (job, error) => {
    logger.error(`[worker] Job ${job?.id ?? "unknown"} failed.`, error);
  });

  await startAppScheduler();

  const shutdown = async (signal: string) => {
    logger.info(`[worker] Received ${signal}, shutting down...`);
    await worker.close();
    await stopAppScheduler();
    await closeRedis();
    exit(0);
  };

  processLike.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  processLike.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  return {
    shutdown,
    worker,
  };
}

async function main() {
  await startWorkerApp();
}

if (import.meta.main) {
  void main().catch(async (error) => {
    console.error("[worker] Failed to start worker.", error);
    await stopScheduler().catch(() => undefined);
    await closeRedisConnection();
    process.exit(1);
  });
}
