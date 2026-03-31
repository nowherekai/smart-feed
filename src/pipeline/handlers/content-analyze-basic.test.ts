import { expect, test } from "bun:test";

import { createContentAnalyzeBasicHandler } from "./content-analyze-basic";

test("contentAnalyzeBasicHandler enqueues heavy step through pipeline runtime", async () => {
  const enqueuedJobs: Array<{ data: Record<string, unknown>; jobName: string }> = [];
  const handler = createContentAnalyzeBasicHandler(
    async (jobData) => ({
      nextStep: {
        data: {
          contentId: jobData.contentId,
          trigger: "content.analyze.basic",
        },
        jobName: "content.analyze.heavy",
      },
      outcome: "completed",
      payload: {
        analysisRecordId: "analysis-1",
        cached: false,
        contentId: jobData.contentId,
        modelStrategy: "dummy-basic",
        promptVersion: "basic-analysis-v1",
        runtimeState: "dummy",
        thresholdExceeded: true,
        valueScore: 8,
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
      pipelineRunId: "pipeline-1",
      trigger: "content.normalize",
    },
    name: "content.analyze.basic",
  } as never);

  expect(result).toEqual({
    jobName: "content.analyze.basic",
    message: null,
    nextStepQueued: true,
    outcome: "completed",
    payload: {
      analysisRecordId: "analysis-1",
      cached: false,
      contentId: "content-1",
      modelStrategy: "dummy-basic",
      promptVersion: "basic-analysis-v1",
      runtimeState: "dummy",
      thresholdExceeded: true,
      valueScore: 8,
    },
    pipelineRunId: "pipeline-1",
    status: "completed",
  });
  expect(enqueuedJobs).toEqual([
    {
      data: {
        contentId: "content-1",
        pipelineRunId: "pipeline-1",
        trigger: "content.analyze.basic",
      },
      jobName: "content.analyze.heavy",
    },
  ]);
});
