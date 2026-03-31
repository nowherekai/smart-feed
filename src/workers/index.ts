import type { Job } from "bullmq";

import { type PipelineJobData, type PipelineJobResult, pipelineHandlers } from "../pipeline";
import { closeRedisConnection, createWorker, type JobName } from "../queue";

function getHandler(jobName: string) {
  const handler = pipelineHandlers[jobName as JobName];

  if (!handler) {
    throw new Error(`[worker] Unsupported job "${jobName}".`);
  }

  return handler;
}

async function main() {
  console.info("[worker] Starting smart-feed worker...");

  const worker = createWorker(
    async (job: Job<PipelineJobData, PipelineJobResult, JobName>): Promise<PipelineJobResult> => {
      const handler = getHandler(job.name);
      return handler(job);
    },
  );

  worker.on("ready", () => {
    console.info("[worker] Worker is ready.");
  });

  worker.on("failed", (job, error) => {
    console.error(`[worker] Job ${job?.id ?? "unknown"} failed.`, error);
  });

  const shutdown = async (signal: string) => {
    console.info(`[worker] Received ${signal}, shutting down...`);
    await worker.close();
    await closeRedisConnection();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

main().catch(async (error) => {
  console.error("[worker] Failed to start worker.", error);
  await closeRedisConnection();
  process.exit(1);
});
