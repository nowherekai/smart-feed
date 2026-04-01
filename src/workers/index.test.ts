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
    async startBullBoard() {
      steps.push("bull-board.start");
      return {
        async close() {
          steps.push("bull-board.close");
        },
        basePath: "/admin/queues",
        host: "127.0.0.1",
        port: 3010,
        url: "http://127.0.0.1:3010/admin/queues",
      };
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
    "bull-board.start",
  ]);
  expect(Object.keys(signalHandlers).sort()).toEqual(["SIGINT", "SIGTERM"]);
  expect(app.workers).toHaveLength(6);
  expect(app.bullBoard?.url).toBe("http://127.0.0.1:3010/admin/queues");

  await app.shutdown("SIGTERM");

  expect(steps).toEqual([
    `worker.create:${queueNames.sourceDispatch}`,
    `worker.create:${queueNames.ingestion}`,
    `worker.create:${queueNames.content}`,
    `worker.create:${queueNames.ai}`,
    `worker.create:${queueNames.digest}`,
    `worker.create:${legacyImportQueueName}`,
    "scheduler.start",
    "bull-board.start",
    "bull-board.close",
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

test("startWorkerApp cleans up workers and scheduler when bull-board startup fails", async () => {
  const steps: string[] = [];

  await expect(
    startWorkerApp({
      async closeLegacyImportQueue() {
        steps.push("legacy-queue.close");
      },
      async closeRedisConnection() {
        steps.push("redis.close");
      },
      createWorker(queueName) {
        steps.push(`worker.create:${queueName}`);
        return {
          async close() {
            steps.push(`worker.close:${queueName}`);
          },
          on() {
            return this as never;
          },
        } as never;
      },
      logger: {
        error() {},
        info() {},
      },
      process: {
        exit() {
          return undefined;
        },
        once() {},
      },
      async startBullBoard() {
        steps.push("bull-board.start");
        throw new Error("port already in use");
      },
      async startScheduler() {
        steps.push("scheduler.start");
      },
      async stopScheduler() {
        steps.push("scheduler.stop");
      },
    }),
  ).rejects.toThrow("port already in use");

  expect(steps).toEqual([
    `worker.create:${queueNames.sourceDispatch}`,
    `worker.create:${queueNames.ingestion}`,
    `worker.create:${queueNames.content}`,
    `worker.create:${queueNames.ai}`,
    `worker.create:${queueNames.digest}`,
    `worker.create:${legacyImportQueueName}`,
    "scheduler.start",
    "bull-board.start",
    `worker.close:${queueNames.sourceDispatch}`,
    `worker.close:${queueNames.ingestion}`,
    `worker.close:${queueNames.content}`,
    `worker.close:${queueNames.ai}`,
    `worker.close:${queueNames.digest}`,
    `worker.close:${legacyImportQueueName}`,
    "scheduler.stop",
    "legacy-queue.close",
    "redis.close",
  ]);
});
