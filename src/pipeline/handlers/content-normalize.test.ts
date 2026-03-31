import { expect, test } from "bun:test";

import { createContentNormalizeHandler } from "./content-normalize";

test("contentNormalizeHandler executes via pipeline runtime", async () => {
  const enqueuedJobs: Array<{ data: Record<string, unknown>; jobName: string }> = [];
  const handler = createContentNormalizeHandler(
    async (jobData) => ({
      nextStep: {
        data: {
          contentId: jobData.contentId,
          trigger: "content.normalize",
        },
        jobName: "content.analyze.basic",
      },
      outcome: "completed",
      payload: {
        contentId: jobData.contentId,
        markdownBytes: 128,
        truncated: false,
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
        return new Date("2026-03-31T12:00:00.000Z");
      },
      async updatePipelineRun() {},
      async updateStepRun() {},
    },
  );

  const result = await handler({
    data: {
      contentId: "content-1",
      trigger: "content.fetch-html",
    },
    name: "content.normalize",
  } as never);

  expect(result).toEqual({
    jobName: "content.normalize",
    message: null,
    nextStepQueued: true,
    outcome: "completed",
    payload: {
      contentId: "content-1",
      markdownBytes: 128,
      truncated: false,
    },
    pipelineRunId: "pipeline-1",
    status: "completed",
  });
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
