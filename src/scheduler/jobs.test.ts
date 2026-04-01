import { expect, test } from "bun:test";

import { queueNames } from "../queue";
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
      queueName: queueNames.sourceDispatch,
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
      queueName: queueNames.digest,
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
    queueName: string;
    repeat: Record<string, unknown>;
    template: Record<string, unknown>;
  }> = [];

  await registerSchedulerJobs(
    {
      [queueNames.sourceDispatch]: {
        async upsertJobScheduler(id: string, repeat: Record<string, unknown>, template: Record<string, unknown>) {
          calls.push({ id, queueName: queueNames.sourceDispatch, repeat, template });
        },
      },
      [queueNames.digest]: {
        async upsertJobScheduler(id: string, repeat: Record<string, unknown>, template: Record<string, unknown>) {
          calls.push({ id, queueName: queueNames.digest, repeat, template });
        },
      },
      [queueNames.ingestion]: {},
      [queueNames.content]: {},
      [queueNames.ai]: {},
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
      queueName: "source-dispatch-queue",
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
      queueName: "digest-queue",
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
  const removedCalls: Array<{ id: string; queueName: string }> = [];

  await removeSchedulerJobs({
    [queueNames.sourceDispatch]: {
      async removeJobScheduler(id: string) {
        removedCalls.push({ id, queueName: queueNames.sourceDispatch });
        return true;
      },
    },
    [queueNames.digest]: {
      async removeJobScheduler(id: string) {
        removedCalls.push({ id, queueName: queueNames.digest });
        return true;
      },
    },
    [queueNames.ingestion]: {},
    [queueNames.content]: {},
    [queueNames.ai]: {},
  } as never);

  expect(removedCalls).toEqual([
    { id: "scheduler.sources.sync.hourly", queueName: "source-dispatch-queue" },
    { id: "scheduler.digest.compose.daily", queueName: "digest-queue" },
  ]);
});
