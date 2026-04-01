/**
 * 调度管理模块
 * 负责启动和停止系统的定时任务调度器。
 */

import type { Queue } from "bullmq";

import { type AppEnv, getAppEnv } from "../config";
import { closeQueue, createQueue } from "../queue";
import { registerSchedulerJobs, removeSchedulerJobs } from "./jobs";

/** 调度任务所需的配置子集 */
type SchedulerAppEnv = Pick<AppEnv, "digestSendHour" | "digestTimeZone" | "timeZone">;

/** 调度依赖项，支持依赖注入以方便测试 */
export type SchedulerDeps = {
  appEnv?: SchedulerAppEnv;
  closeQueue?: () => Promise<void>;
  createQueue?: () => Queue<Record<string, unknown>, unknown, string>;
  registerSchedulerJobs?: (
    queue: Queue<Record<string, unknown>, unknown, string>,
    appEnv: SchedulerAppEnv,
  ) => Promise<void>;
  removeSchedulerJobs?: (queue: Queue<Record<string, unknown>, unknown, string>) => Promise<void>;
};

// 运行状态标识
let schedulerStartPromise: Promise<void> | null = null;
let schedulerStarted = false;
let schedulerQueue: Queue<Record<string, unknown>, unknown, string> | null = null;

/**
 * 启动定时任务调度器
 * 会在 BullMQ 队列中注册所有预定义的 Repeatable Jobs。
 */
export async function startScheduler(deps: SchedulerDeps = {}): Promise<void> {
  if (schedulerStartPromise) {
    return schedulerStartPromise;
  }

  const queue = (deps.createQueue ?? (() => createQueue<Record<string, unknown>>()))();
  schedulerQueue = queue;
  const appEnv = deps.appEnv ?? getAppEnv();
  const registerJobs = deps.registerSchedulerJobs ?? registerSchedulerJobs;

  schedulerStartPromise = registerJobs(queue, appEnv)
    .then(() => {
      schedulerStarted = true;
    })
    .catch((error) => {
      // 启动失败，重置内部状态
      schedulerStartPromise = null;
      schedulerStarted = false;
      schedulerQueue = null;
      throw error;
    });

  return schedulerStartPromise;
}

/**
 * 停止定时任务调度器
 * 会移除所有已注册的调度任务并关闭队列连接。
 */
export async function stopScheduler(deps: SchedulerDeps = {}): Promise<void> {
  if (!schedulerStartPromise && !schedulerStarted) {
    return;
  }

  try {
    if (schedulerStartPromise) {
      await schedulerStartPromise;
    }

    if (schedulerQueue) {
      await (deps.removeSchedulerJobs ?? removeSchedulerJobs)(schedulerQueue);
    }
  } finally {
    // 确保无论如何都重置状态
    schedulerStartPromise = null;
    schedulerStarted = false;
    schedulerQueue = null;
  }

  await (deps.closeQueue ?? closeQueue)();
}
