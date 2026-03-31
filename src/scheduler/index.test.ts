import { expect, test } from "bun:test";
import type { Queue } from "bullmq";

import { startScheduler, stopScheduler } from "./index";

test("startScheduler is idempotent until stopScheduler resets the lifecycle", async () => {
  let createQueueCalls = 0;
  let registerCalls = 0;
  let closeQueueCalls = 0;
  const lifecycleSteps: string[] = [];
  const queue = {} as Queue<Record<string, unknown>, unknown, string>;

  const deps = {
    appEnv: {
      digestSendHour: 8,
      digestTimeZone: "Asia/Shanghai",
      timeZone: "Asia/Shanghai",
    },
    async closeQueue() {
      closeQueueCalls += 1;
      lifecycleSteps.push("close");
    },
    createQueue() {
      createQueueCalls += 1;
      return queue;
    },
    async registerSchedulerJobs() {
      registerCalls += 1;
      lifecycleSteps.push("register");
    },
    async removeSchedulerJobs(receivedQueue: Queue<Record<string, unknown>, unknown, string>) {
      expect(receivedQueue).toBe(queue);
      lifecycleSteps.push("remove");
    },
  };

  await stopScheduler({
    closeQueue: async () => undefined,
  });

  await startScheduler(deps);
  await startScheduler(deps);

  expect(createQueueCalls).toBe(1);
  expect(registerCalls).toBe(1);

  await stopScheduler(deps);
  expect(closeQueueCalls).toBe(1);
  expect(lifecycleSteps.slice(0, 3)).toEqual(["register", "remove", "close"]);

  await startScheduler(deps);
  expect(createQueueCalls).toBe(2);
  expect(registerCalls).toBe(2);

  await stopScheduler(deps);
  expect(closeQueueCalls).toBe(2);
  expect(lifecycleSteps).toEqual(["register", "remove", "close", "register", "remove", "close"]);
});
