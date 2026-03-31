import type { Queue } from "bullmq";

import { type AppEnv, getAppEnv } from "../config";
import { closeQueue, createQueue } from "../queue";
import { registerSchedulerJobs, removeSchedulerJobs } from "./jobs";

type SchedulerAppEnv = Pick<AppEnv, "digestSendHour" | "digestTimeZone" | "timeZone">;

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

let schedulerStartPromise: Promise<void> | null = null;
let schedulerStarted = false;
let schedulerQueue: Queue<Record<string, unknown>, unknown, string> | null = null;

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
      schedulerStartPromise = null;
      schedulerStarted = false;
      schedulerQueue = null;
      throw error;
    });

  return schedulerStartPromise;
}

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
    schedulerStartPromise = null;
    schedulerStarted = false;
    schedulerQueue = null;
  }

  await (deps.closeQueue ?? closeQueue)();
}
