import { expect, test } from "bun:test";

import { buildSchedulerJobDefinitions, registerSchedulerJobs, removeSchedulerJobs, schedulerJobIds } from "./jobs";

test("buildSchedulerJobDefinitions uses business timezone for hourly sync and digest timezone for daily compose", () => {
  const definitions = buildSchedulerJobDefinitions({
    digestSendHour: 8,
    digestTimeZone: "Asia/Shanghai",
    timeZone: "UTC",
  });

  expect(definitions).toEqual([
    {
      id: schedulerJobIds.sourcesSyncHourly,
      repeat: {
        pattern: "0 * * * *",
        tz: "UTC",
      },
      template: {
        data: {
          trigger: "scheduler",
        },
        name: "scheduler.sources.sync",
      },
    },
    {
      id: schedulerJobIds.digestComposeDaily,
      repeat: {
        pattern: "0 8 * * *",
        tz: "Asia/Shanghai",
      },
      template: {
        data: {
          trigger: "scheduler",
        },
        name: "digest.compose",
      },
    },
  ]);
});

test("registerSchedulerJobs upserts the fixed scheduler entries", async () => {
  const calls: Array<{
    id: string;
    repeat: Record<string, unknown>;
    template: Record<string, unknown>;
  }> = [];

  await registerSchedulerJobs(
    {
      async upsertJobScheduler(id: string, repeat: Record<string, unknown>, template: Record<string, unknown>) {
        calls.push({
          id,
          repeat,
          template,
        });
      },
    } as never,
    {
      digestSendHour: 8,
      digestTimeZone: "Asia/Shanghai",
      timeZone: "Asia/Shanghai",
    },
  );

  expect(calls).toEqual([
    {
      id: "scheduler.sources.sync.hourly",
      repeat: {
        pattern: "0 * * * *",
        tz: "Asia/Shanghai",
      },
      template: {
        data: {
          trigger: "scheduler",
        },
        name: "scheduler.sources.sync",
      },
    },
    {
      id: "scheduler.digest.compose.daily",
      repeat: {
        pattern: "0 8 * * *",
        tz: "Asia/Shanghai",
      },
      template: {
        data: {
          trigger: "scheduler",
        },
        name: "digest.compose",
      },
    },
  ]);
});

test("removeSchedulerJobs removes the fixed scheduler entries", async () => {
  const removedIds: string[] = [];

  await removeSchedulerJobs({
    async removeJobScheduler(id: string) {
      removedIds.push(id);
      return true;
    },
  } as never);

  expect(removedIds).toEqual(["scheduler.digest.compose.daily", "scheduler.sources.sync.hourly"]);
});
