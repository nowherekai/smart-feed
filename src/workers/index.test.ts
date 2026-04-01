import { expect, test } from "bun:test";

import { legacyImportQueueName, queueNames } from "../queue";
import { startWorkerApp } from "./index";

test("startWorkerApp starts all workers and shuts resources down in order", async () => {
  const steps: string[] = [];
  const signalHandlers: Partial<Record<"SIGINT" | "SIGTERM", () => void>> = {};

  const worker = {
    async close() {
      steps.push("worker.close");
    },
    on() {
      return worker;
    },
  };

  const app = await startWorkerApp({
    async closeLegacyImportQueue() {
      steps.push("legacy-queue.close");
    },
    async closeRedisConnection() {
      steps.push("redis.close");
    },
    createWorker(queueName) {
      steps.push(`worker.create:${queueName}`);
      return worker as never;
    },
    exit(code) {
      steps.push(`exit:${code}`);
    },
    logger: {
      error() {},
      info() {},
    },
    process: {
      exit() {
        return undefined;
      },
      once(event, listener) {
        signalHandlers[event] = listener;
      },
    },
    async startScheduler() {
      steps.push("scheduler.start");
    },
    async stopScheduler() {
      steps.push("scheduler.stop");
    },
  });

  expect(steps).toEqual([
    `worker.create:${queueNames.sourceDispatch}`,
    `worker.create:${queueNames.ingestion}`,
    `worker.create:${queueNames.content}`,
    `worker.create:${queueNames.ai}`,
    `worker.create:${queueNames.digest}`,
    `worker.create:${legacyImportQueueName}`,
    "scheduler.start",
  ]);
  expect(Object.keys(signalHandlers).sort()).toEqual(["SIGINT", "SIGTERM"]);
  expect(app.workers).toHaveLength(6);

  await app.shutdown("SIGTERM");

  expect(steps).toEqual([
    `worker.create:${queueNames.sourceDispatch}`,
    `worker.create:${queueNames.ingestion}`,
    `worker.create:${queueNames.content}`,
    `worker.create:${queueNames.ai}`,
    `worker.create:${queueNames.digest}`,
    `worker.create:${legacyImportQueueName}`,
    "scheduler.start",
    "worker.close",
    "worker.close",
    "worker.close",
    "worker.close",
    "worker.close",
    "worker.close",
    "scheduler.stop",
    "legacy-queue.close",
    "redis.close",
    "exit:0",
  ]);
});
