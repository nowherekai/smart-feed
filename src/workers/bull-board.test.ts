import { expect, test } from "bun:test";

import { type QueueRegistry, queueNames } from "../queue";
import { buildBullBoardQueueAdapters, startWorkerBullBoard, WORKER_BULL_BOARD_BASE_PATH } from "./bull-board";

function createMockRegistry(): QueueRegistry {
  return {
    [queueNames.sourceDispatch]: { name: queueNames.sourceDispatch } as never,
    [queueNames.ingestion]: { name: queueNames.ingestion } as never,
    [queueNames.content]: { name: queueNames.content } as never,
    [queueNames.ai]: { name: queueNames.ai } as never,
    [queueNames.digest]: { name: queueNames.digest } as never,
  };
}

test("buildBullBoardQueueAdapters covers all five functional queues", () => {
  const adapters = buildBullBoardQueueAdapters(createMockRegistry(), (queue, queueName) => ({
    queueName,
    rawName: queue.name,
  }));

  expect(adapters).toEqual([
    { queueName: queueNames.sourceDispatch, rawName: queueNames.sourceDispatch },
    { queueName: queueNames.ingestion, rawName: queueNames.ingestion },
    { queueName: queueNames.content, rawName: queueNames.content },
    { queueName: queueNames.ai, rawName: queueNames.ai },
    { queueName: queueNames.digest, rawName: queueNames.digest },
  ]);
});

test("startWorkerBullBoard mounts fixed base path and listens on configured host/port", async () => {
  const mountedRoutes: Array<{ path: string; router: unknown }> = [];
  const listenCalls: Array<{ host: string; port: number }> = [];
  const closed: string[] = [];
  let registeredQueueCount = 0;
  let basePath = "";
  const router = { kind: "router" };
  const listeners: Partial<Record<"error" | "listening", (...args: unknown[]) => void>> = {};

  const server = {
    close(callback: (error?: Error | null) => void) {
      closed.push("server.close");
      callback();
    },
    off() {
      return server;
    },
    once(event: "error" | "listening", listener: (...args: unknown[]) => void) {
      listeners[event] = listener;

      if (event === "listening") {
        queueMicrotask(() => {
          listeners.listening?.();
        });
      }
    },
    removeListener() {
      return server;
    },
  };

  const bullBoard = await startWorkerBullBoard({
    createApp: () => ({
      listen(port: number, host: string) {
        listenCalls.push({ host, port });
        return server;
      },
      use(path: string, handler: unknown) {
        mountedRoutes.push({ path, router: handler });
      },
    }),
    createBullBoard(input) {
      registeredQueueCount = input.queues.length;
    },
    createQueueAdapter(queue, queueName) {
      return { queueName, rawName: queue.name };
    },
    createServerAdapter: () => ({
      getRouter() {
        return router;
      },
      setBasePath(path: string) {
        basePath = path;
      },
    }),
    getQueueRegistry: createMockRegistry,
    logger: {
      info() {},
    },
    workerEnv: {
      bullBoardHost: "127.0.0.1",
      bullBoardPort: 3010,
    },
  });

  expect(basePath).toBe(WORKER_BULL_BOARD_BASE_PATH);
  expect(mountedRoutes).toEqual([{ path: WORKER_BULL_BOARD_BASE_PATH, router }]);
  expect(listenCalls).toEqual([{ host: "127.0.0.1", port: 3010 }]);
  expect(registeredQueueCount).toBe(5);
  expect(bullBoard.url).toBe("http://127.0.0.1:3010/admin/queues");

  await bullBoard.close();
  expect(closed).toEqual(["server.close"]);
});
