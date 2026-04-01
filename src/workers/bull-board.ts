/**
 * Worker 侧 bull-board 管理服务
 * 提供独立 HTTP 入口，用于查看和管理所有职能队列。
 */

import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import type { Queue } from "bullmq";
import express from "express";

import { getQueueRegistry, type QueueName, type QueueRegistry, queueNames } from "../queue";
import { getWorkerEnv, type WorkerEnv } from "./env";

export const WORKER_BULL_BOARD_BASE_PATH = "/admin/queues";

type LoggerLike = Pick<typeof console, "info">;

type QueueAdapterFactory = (queue: Queue<Record<string, unknown>, unknown, string>, queueName: QueueName) => unknown;

type ServerAdapterLike = {
  getRouter: () => unknown;
  setBasePath: (path: string) => void;
};

type HttpServerLike = {
  close: (callback: (error?: Error | null) => void) => unknown;
  off?: (event: "error" | "listening", listener: (...args: unknown[]) => void) => unknown;
  once: (event: "error" | "listening", listener: (...args: unknown[]) => void) => unknown;
  removeListener?: (event: "error" | "listening", listener: (...args: unknown[]) => void) => unknown;
};

type ExpressAppLike = {
  listen: (port: number, host: string) => HttpServerLike;
  use: (path: string, handler: unknown) => void;
};

export type WorkerBullBoardServer = {
  basePath: string;
  close: () => Promise<void>;
  host: string;
  port: number;
  url: string;
};

export type WorkerBullBoardDeps = {
  createApp?: () => ExpressAppLike;
  createBullBoard?: (input: { queues: unknown[]; serverAdapter: ServerAdapterLike }) => void;
  createQueueAdapter?: QueueAdapterFactory;
  createServerAdapter?: () => ServerAdapterLike;
  getQueueRegistry?: () => QueueRegistry;
  logger?: LoggerLike;
  workerEnv?: WorkerEnv;
};

function removeServerListener(
  server: HttpServerLike,
  event: "error" | "listening",
  listener: (...args: unknown[]) => void,
) {
  if (typeof server.off === "function") {
    server.off(event, listener);
    return;
  }

  if (typeof server.removeListener === "function") {
    server.removeListener(event, listener);
  }
}

function waitForServerListening(server: HttpServerLike): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleError = (error: unknown) => {
      removeServerListener(server, "listening", handleListening);
      reject(error);
    };
    const handleListening = () => {
      removeServerListener(server, "error", handleError);
      resolve();
    };

    server.once("error", handleError);
    server.once("listening", handleListening);
  });
}

function closeServer(server: HttpServerLike): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export function buildBullBoardQueueAdapters(
  registry: QueueRegistry,
  createQueueAdapter: QueueAdapterFactory = (queue) => new BullMQAdapter(queue),
) {
  return Object.values(queueNames).map((queueName) => createQueueAdapter(registry[queueName], queueName));
}

export async function startWorkerBullBoard(deps: WorkerBullBoardDeps = {}): Promise<WorkerBullBoardServer> {
  const workerEnv = deps.workerEnv ?? getWorkerEnv();
  const app = (deps.createApp ?? (() => express()))();
  const serverAdapter = (deps.createServerAdapter ?? (() => new ExpressAdapter()))();
  const registry = (deps.getQueueRegistry ?? getQueueRegistry)();
  const logger = deps.logger ?? console;
  const queueAdapters = buildBullBoardQueueAdapters(registry, deps.createQueueAdapter);

  serverAdapter.setBasePath(WORKER_BULL_BOARD_BASE_PATH);

  if (deps.createBullBoard) {
    deps.createBullBoard({
      queues: queueAdapters,
      serverAdapter,
    });
  } else {
    const input = {
      queues: queueAdapters,
      serverAdapter,
    } as Parameters<typeof createBullBoard>[0];
    createBullBoard(input);
  }

  app.use(WORKER_BULL_BOARD_BASE_PATH, serverAdapter.getRouter());

  const server = app.listen(workerEnv.bullBoardPort, workerEnv.bullBoardHost);
  await waitForServerListening(server);

  const url = `http://${workerEnv.bullBoardHost}:${workerEnv.bullBoardPort}${WORKER_BULL_BOARD_BASE_PATH}`;
  logger.info(`[worker] bull-board is listening on ${url}`);

  return {
    basePath: WORKER_BULL_BOARD_BASE_PATH,
    close: () => closeServer(server),
    host: workerEnv.bullBoardHost,
    port: workerEnv.bullBoardPort,
    url,
  };
}
