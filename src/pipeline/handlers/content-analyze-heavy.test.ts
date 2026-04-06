import { expect, test } from "bun:test";

import { createContentAnalyzeHeavyHandler } from "./content-analyze-heavy";

test("contentAnalyzeHeavyHandler completes pipeline via runtime", async () => {
  const pipelineUpdates: Array<Record<string, unknown>> = [];
  const handler = createContentAnalyzeHeavyHandler(
    async (jobData) => ({
      outcome: "completed",
      payload: {
        analysisRecordId: "analysis-heavy-1",
        cached: false,
        contentId: jobData.contentId,
        modelStrategy: "dummy-heavy",
        promptVersion: "heavy-summary-v1",
        runtimeState: "dummy",
        status: "full",
      },
      status: "completed",
    }),
    {
      async createStepRun() {
        return { id: "step-1" };
      },
      async createPipelineRun() {
        return { id: "pipeline-1" };
      },
      async enqueueJob() {
        throw new Error("heavy step should not enqueue next step");
      },
      now() {
        return new Date("2026-03-31T12:00:00.000Z");
      },
      async updatePipelineRun(_id, data) {
        pipelineUpdates.push(data as Record<string, unknown>);
      },
      async updateStepRun() {},
    },
  );

  const result = await handler({
    data: {
      contentId: "content-1",
      pipelineRunId: "pipeline-1",
      trigger: "content.analyze.basic",
    },
    name: "content.analyze.heavy",
  } as never);

  expect(result).toEqual({
    jobName: "content.analyze.heavy",
    message: null,
    nextStepQueued: false,
    outcome: "completed",
    payload: {
      analysisRecordId: "analysis-heavy-1",
      cached: false,
      contentId: "content-1",
      modelStrategy: "dummy-heavy",
      promptVersion: "heavy-summary-v1",
      runtimeState: "dummy",
      status: "full",
    },
    pipelineRunId: "pipeline-1",
    status: "completed",
  });
  expect(pipelineUpdates.at(-1)).toMatchObject({
    status: "completed",
  });
});
