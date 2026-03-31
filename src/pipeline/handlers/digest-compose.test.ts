import { expect, test } from "bun:test";

import { createDigestComposeHandler } from "./digest-compose";

test("digestComposeHandler enqueues digest.deliver and links digest id into pipeline run", async () => {
  const enqueuedJobs: Array<{ data: Record<string, unknown>; jobName: string }> = [];
  const pipelineUpdates: Array<Record<string, unknown>> = [];

  const handler = createDigestComposeHandler(
    async () => ({
      message: "digest.compose prepared 1 items for 2026-03-31",
      nextStep: {
        data: {
          digestId: "digest-1",
          trigger: "digest.compose",
        },
        jobName: "digest.deliver",
      },
      outcome: "completed",
      payload: {
        digestDate: "2026-03-31",
        digestId: "digest-1",
        emptyDigest: false,
        itemCount: 1,
        reusedExistingDigest: false,
        skippedBecauseAlreadySent: false,
        windowEnd: "2026-03-31T00:00:00.000Z",
        windowStart: "2026-03-30T00:00:00.000Z",
      },
      status: "completed",
    }),
    {
      async createPipelineRun() {
        return { id: "pipeline-1" };
      },
      async createStepRun() {
        return { id: "step-1" };
      },
      async enqueueJob(jobName, data) {
        enqueuedJobs.push({ data, jobName });
      },
      now() {
        return new Date("2026-03-31T00:30:00.000Z");
      },
      async updatePipelineRun(_id, data) {
        pipelineUpdates.push(data as Record<string, unknown>);
      },
      async updateStepRun() {},
    },
  );

  const result = await handler({
    data: {
      trigger: "scheduler",
    },
    name: "digest.compose",
  } as never);

  expect(result).toEqual({
    jobName: "digest.compose",
    message: "digest.compose prepared 1 items for 2026-03-31",
    nextStepQueued: true,
    outcome: "completed",
    payload: {
      digestDate: "2026-03-31",
      digestId: "digest-1",
      emptyDigest: false,
      itemCount: 1,
      reusedExistingDigest: false,
      skippedBecauseAlreadySent: false,
      windowEnd: "2026-03-31T00:00:00.000Z",
      windowStart: "2026-03-30T00:00:00.000Z",
    },
    pipelineRunId: "pipeline-1",
    status: "completed",
  });
  expect(enqueuedJobs).toEqual([
    {
      data: {
        digestId: "digest-1",
        pipelineRunId: "pipeline-1",
        trigger: "digest.compose",
      },
      jobName: "digest.deliver",
    },
  ]);
  expect(pipelineUpdates.at(-1)).toMatchObject({
    digestId: "digest-1",
    status: "running",
  });
});

test("digestComposeHandler completes without enqueue when compose reports already sent digest", async () => {
  const enqueuedJobs: Array<{ data: Record<string, unknown>; jobName: string }> = [];
  const pipelineUpdates: Array<Record<string, unknown>> = [];

  const handler = createDigestComposeHandler(
    async () => ({
      message: "digest.compose skipped because 2026-03-31 has already been sent",
      outcome: "completed",
      payload: {
        digestDate: "2026-03-31",
        digestId: "digest-sent",
        emptyDigest: false,
        itemCount: 0,
        reusedExistingDigest: false,
        skippedBecauseAlreadySent: true,
        windowEnd: "2026-03-31T00:00:00.000Z",
        windowStart: "2026-03-30T00:00:00.000Z",
      },
      status: "completed",
    }),
    {
      async createPipelineRun() {
        return { id: "pipeline-1" };
      },
      async createStepRun() {
        return { id: "step-1" };
      },
      async enqueueJob(jobName, data) {
        enqueuedJobs.push({ data, jobName });
      },
      now() {
        return new Date("2026-03-31T00:30:00.000Z");
      },
      async updatePipelineRun(_id, data) {
        pipelineUpdates.push(data as Record<string, unknown>);
      },
      async updateStepRun() {},
    },
  );

  const result = await handler({
    data: {
      trigger: "manual",
    },
    name: "digest.compose",
  } as never);

  expect(result).toEqual({
    jobName: "digest.compose",
    message: "digest.compose skipped because 2026-03-31 has already been sent",
    nextStepQueued: false,
    outcome: "completed",
    payload: {
      digestDate: "2026-03-31",
      digestId: "digest-sent",
      emptyDigest: false,
      itemCount: 0,
      reusedExistingDigest: false,
      skippedBecauseAlreadySent: true,
      windowEnd: "2026-03-31T00:00:00.000Z",
      windowStart: "2026-03-30T00:00:00.000Z",
    },
    pipelineRunId: "pipeline-1",
    status: "completed",
  });
  expect(enqueuedJobs).toEqual([]);
  expect(pipelineUpdates.at(-1)).toMatchObject({
    digestId: "digest-sent",
    status: "completed",
  });
});
