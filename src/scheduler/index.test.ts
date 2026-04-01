import { expect, test } from "bun:test";
import type { QueueRegistry } from "../queue";

import { startScheduler, stopScheduler } from "./index";

test("startScheduler is idempotent until stopScheduler resets the lifecycle", async () => {
  let getRegistryCalls = 0;
  let registerCalls = 0;
  let closeAllQueueCalls = 0;
  const lifecycleSteps: string[] = [];
  const registry = {
    "ai-queue": {} as never,
    "content-queue": {} as never,
    "digest-queue": {} as never,
    "ingestion-queue": {} as never,
    "source-dispatch-queue": {} as never,
  } as QueueRegistry;

  const deps = {
    appEnv: {
      digestSendHour: 8,
      digestTimeZone: "Asia/Shanghai",
      timeZone: "Asia/Shanghai",
    },
    async closeAllQueues() {
      closeAllQueueCalls += 1;
      lifecycleSteps.push("close");
    },
    getQueueRegistry() {
      getRegistryCalls += 1;
      return registry;
    },
    async registerSchedulerJobs() {
      registerCalls += 1;
      lifecycleSteps.push("register");
    },
    async removeSchedulerJobs(receivedRegistry: QueueRegistry) {
      expect(receivedRegistry).toBe(registry);
      lifecycleSteps.push("remove");
    },
  };

  await stopScheduler({
    closeAllQueues: async () => undefined,
  });

  await startScheduler(deps);
  await startScheduler(deps);

  expect(getRegistryCalls).toBe(1);
  expect(registerCalls).toBe(1);

  await stopScheduler(deps);
  expect(closeAllQueueCalls).toBe(1);
  expect(lifecycleSteps.slice(0, 3)).toEqual(["register", "remove", "close"]);

  await startScheduler(deps);
  expect(getRegistryCalls).toBe(2);
  expect(registerCalls).toBe(2);

  await stopScheduler(deps);
  expect(closeAllQueueCalls).toBe(2);
  expect(lifecycleSteps).toEqual(["register", "remove", "close", "register", "remove", "close"]);
});
