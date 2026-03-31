import { expect, test } from "bun:test";

import { createDigestDeliverHandler } from "./digest-deliver";

test("digestDeliverHandler completes digest pipeline when delivery succeeds", async () => {
  const pipelineUpdates: Array<Record<string, unknown>> = [];

  const handler = createDigestDeliverHandler(
    async () => ({
      message: "digest.deliver sent digest-1 to to@example.com",
      outcome: "completed",
      payload: {
        digestDate: "2026-03-31",
        digestId: "digest-1",
        emailSubject: "[smart-feed] 日报 2026-03-31",
        recipient: "to@example.com",
        sentAt: "2026-03-31T08:00:00.000Z",
        skippedAlreadySent: false,
        skippedDeliveryDisabled: false,
      },
      status: "completed",
    }),
    {
      async createStepRun() {
        return { id: "step-1" };
      },
      async createPipelineRun() {
        throw new Error("should reuse existing pipeline run");
      },
      async enqueueJob() {
        throw new Error("digest.deliver should not enqueue next step");
      },
      now() {
        return new Date("2026-03-31T08:00:00.000Z");
      },
      async updatePipelineRun(_id, data) {
        pipelineUpdates.push(data as Record<string, unknown>);
      },
      async updateStepRun() {},
    },
  );

  const result = await handler({
    data: {
      digestId: "digest-1",
      pipelineRunId: "pipeline-1",
      trigger: "digest.compose",
    },
    name: "digest.deliver",
  } as never);

  expect(result).toEqual({
    jobName: "digest.deliver",
    message: "digest.deliver sent digest-1 to to@example.com",
    nextStepQueued: false,
    outcome: "completed",
    payload: {
      digestDate: "2026-03-31",
      digestId: "digest-1",
      emailSubject: "[smart-feed] 日报 2026-03-31",
      recipient: "to@example.com",
      sentAt: "2026-03-31T08:00:00.000Z",
      skippedAlreadySent: false,
      skippedDeliveryDisabled: false,
    },
    pipelineRunId: "pipeline-1",
    status: "completed",
  });
  expect(pipelineUpdates.at(-1)).toMatchObject({
    digestId: "digest-1",
    status: "completed",
  });
});

test("digestDeliverHandler marks pipeline failed when delivery throws", async () => {
  const pipelineUpdates: Array<Record<string, unknown>> = [];
  const stepUpdates: Array<Record<string, unknown>> = [];

  const handler = createDigestDeliverHandler(
    async () => {
      throw new Error("SMTP refused connection");
    },
    {
      async createStepRun() {
        return { id: "step-1" };
      },
      async createPipelineRun() {
        throw new Error("should reuse existing pipeline run");
      },
      async enqueueJob() {
        throw new Error("digest.deliver should not enqueue next step");
      },
      now() {
        return new Date("2026-03-31T08:00:00.000Z");
      },
      async updatePipelineRun(_id, data) {
        pipelineUpdates.push(data as Record<string, unknown>);
      },
      async updateStepRun(_id, data) {
        stepUpdates.push(data as Record<string, unknown>);
      },
    },
  );

  await expect(
    handler({
      data: {
        digestId: "digest-1",
        pipelineRunId: "pipeline-1",
        trigger: "digest.compose",
      },
      name: "digest.deliver",
    } as never),
  ).rejects.toThrow("SMTP refused connection");

  expect(stepUpdates.at(-1)).toMatchObject({
    errorMessage: "SMTP refused connection",
    status: "failed",
  });
  expect(pipelineUpdates.at(-1)).toMatchObject({
    status: "failed",
  });
});
