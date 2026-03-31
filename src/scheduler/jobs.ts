import type { JobsOptions, Queue, RepeatOptions } from "bullmq";

import { type AppEnv, getAppEnv } from "../config";
import type { SchedulerSourcesSyncJobData } from "../pipeline/handlers/scheduler-sources-sync";
import { jobNames } from "../queue";
import type { DigestComposeJobData } from "../services/digest";

type SchedulerJobTemplate<TData extends Record<string, unknown>> = {
  data: TData;
  name: string;
  opts?: JobsOptions;
};

type SchedulerJobDefinition<TData extends Record<string, unknown> = Record<string, unknown>> = {
  id: string;
  repeat: RepeatOptions;
  template: SchedulerJobTemplate<TData>;
};

type SchedulerAppEnv = Pick<AppEnv, "digestSendHour" | "digestTimeZone" | "timeZone">;

export const schedulerJobIds = {
  digestComposeDaily: "scheduler.digest.compose.daily",
  sourcesSyncHourly: "scheduler.sources.sync.hourly",
} as const;

function buildHourlySourcesSyncJob(appEnv: SchedulerAppEnv): SchedulerJobDefinition<SchedulerSourcesSyncJobData> {
  return {
    id: schedulerJobIds.sourcesSyncHourly,
    repeat: {
      pattern: "0 * * * *",
      tz: appEnv.timeZone,
    },
    template: {
      data: {
        trigger: "scheduler",
      },
      name: jobNames.schedulerSourcesSync,
    },
  };
}

function buildDailyDigestComposeJob(appEnv: SchedulerAppEnv): SchedulerJobDefinition<DigestComposeJobData> {
  return {
    id: schedulerJobIds.digestComposeDaily,
    repeat: {
      pattern: `0 ${appEnv.digestSendHour} * * *`,
      tz: appEnv.digestTimeZone,
    },
    template: {
      data: {
        trigger: "scheduler",
      },
      name: jobNames.digestCompose,
    },
  };
}

export function buildSchedulerJobDefinitions(appEnv: SchedulerAppEnv): SchedulerJobDefinition[] {
  return [buildHourlySourcesSyncJob(appEnv), buildDailyDigestComposeJob(appEnv)];
}

export async function registerSchedulerJobs(
  queue: Queue<Record<string, unknown>, unknown, string>,
  appEnv: SchedulerAppEnv = getAppEnv(),
): Promise<void> {
  for (const definition of buildSchedulerJobDefinitions(appEnv)) {
    await queue.upsertJobScheduler(definition.id, definition.repeat, definition.template);
  }
}

export async function removeSchedulerJobs(queue: Queue<Record<string, unknown>, unknown, string>): Promise<void> {
  for (const schedulerId of Object.values(schedulerJobIds)) {
    await queue.removeJobScheduler(schedulerId);
  }
}
