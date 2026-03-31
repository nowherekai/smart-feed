import { expect, test } from "bun:test";

import { startWorkerApp } from "./index";

test("startWorkerApp starts the scheduler and shuts resources down in order", async () => {
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
    async closeRedisConnection() {
      steps.push("redis.close");
    },
    createWorker() {
      steps.push("worker.create");
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

  expect(steps).toEqual(["worker.create", "scheduler.start"]);
  expect(Object.keys(signalHandlers).sort()).toEqual(["SIGINT", "SIGTERM"]);

  await app.shutdown("SIGTERM");

  expect(steps).toEqual([
    "worker.create",
    "scheduler.start",
    "worker.close",
    "scheduler.stop",
    "redis.close",
    "exit:0",
  ]);
});
