import { expect, test } from "bun:test";

import { executeContentPipelineStep } from "./pipeline-runtime";

test("executeContentPipelineStep blocks enqueue when step returns failed", async () => {
  const enqueuedJobs: Array<{ data: Record<string, unknown>; jobName: string }> = [];
  const pipelineUpdates: Array<Record<string, unknown>> = [];
  const stepUpdates: Array<Record<string, unknown>> = [];

  const result = await executeContentPipelineStep({
    deps: {
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
        return new Date("2026-03-31T12:00:00.000Z");
      },
      async updatePipelineRun(_id, data) {
        pipelineUpdates.push(data as Record<string, unknown>);
      },
      async updateStepRun(_id, data) {
        stepUpdates.push(data as Record<string, unknown>);
      },
    },
    jobData: {
      contentId: "content-1",
      trigger: "content.normalize",
    },
    jobName: "content.analyze.basic",
    runStep: async () => ({
      message: "AI provider is not configured",
      outcome: "failed",
      payload: {
        contentId: "content-1",
      },
      status: "failed",
    }),
  });

  expect(result).toEqual({
    jobName: "content.analyze.basic",
    message: "AI provider is not configured",
    nextStepQueued: false,
    outcome: "failed",
    payload: {
      contentId: "content-1",
    },
    pipelineRunId: "pipeline-1",
    status: "failed",
  });
  expect(enqueuedJobs).toEqual([]);
  expect(stepUpdates.at(-1)).toMatchObject({
    errorMessage: "AI provider is not configured",
    status: "failed",
  });
  expect(pipelineUpdates.at(-1)).toMatchObject({
    status: "failed",
  });
});

test("executeContentPipelineStep reuses existing pipeline run id for next step", async () => {
  const enqueuedJobs: Array<{ data: Record<string, unknown>; jobName: string }> = [];

  const result = await executeContentPipelineStep({
    deps: {
      async createPipelineRun() {
        throw new Error("should not create a new pipeline run");
      },
      async createStepRun() {
        return { id: "step-1" };
      },
      async enqueueJob(jobName, data) {
        enqueuedJobs.push({ data, jobName });
      },
      now() {
        return new Date("2026-03-31T12:00:00.000Z");
      },
      async updatePipelineRun() {},
      async updateStepRun() {},
    },
    jobData: {
      contentId: "content-1",
      pipelineRunId: "pipeline-1",
      trigger: "content.fetch-html",
    },
    jobName: "content.normalize",
    runStep: async () => ({
      nextStep: {
        data: {
          contentId: "content-1",
          trigger: "content.normalize",
        },
        jobName: "content.analyze.basic",
      },
      outcome: "completed",
      payload: {
        contentId: "content-1",
      },
      status: "completed",
    }),
  });

  expect(result.pipelineRunId).toBe("pipeline-1");
  expect(result.nextStepQueued).toBe(true);
  expect(enqueuedJobs).toEqual([
    {
      data: {
        contentId: "content-1",
        pipelineRunId: "pipeline-1",
        trigger: "content.normalize",
      },
      jobName: "content.analyze.basic",
    },
  ]);
});

test("executeContentPipelineStep treats fallback outcome as completed and still enqueues next step", async () => {
  const enqueuedJobs: Array<{ data: Record<string, unknown>; jobName: string }> = [];
  const stepUpdates: Array<Record<string, unknown>> = [];

  const result = await executeContentPipelineStep({
    deps: {
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
        return new Date("2026-03-31T12:00:00.000Z");
      },
      async updatePipelineRun() {},
      async updateStepRun(_id, data) {
        stepUpdates.push(data as Record<string, unknown>);
      },
    },
    jobData: {
      contentId: "content-1",
      trigger: "source.fetch",
    },
    jobName: "content.fetch-html",
    runStep: async () => ({
      message: "content.fetch-html completed with RSS fallback",
      nextStep: {
        data: {
          contentId: "content-1",
          trigger: "content.fetch-html",
        },
        jobName: "content.normalize",
      },
      outcome: "completed_with_fallback",
      payload: {
        contentId: "content-1",
        fetched: false,
      },
      status: "completed",
    }),
  });

  expect(result.outcome).toBe("completed_with_fallback");
  expect(result.nextStepQueued).toBe(true);
  expect(enqueuedJobs).toEqual([
    {
      data: {
        contentId: "content-1",
        pipelineRunId: "pipeline-1",
        trigger: "content.fetch-html",
      },
      jobName: "content.normalize",
    },
  ]);
  expect(stepUpdates.at(-1)).toMatchObject({
    errorMessage: null,
    status: "completed",
  });
});
