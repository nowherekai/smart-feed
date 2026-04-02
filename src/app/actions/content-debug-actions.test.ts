import { expect, test } from "bun:test";
import { enqueueBasicAnalysisImpl, enqueueFullAiFlowImpl, enqueueHeavyAnalysisImpl } from "./content-debug-action-impl";

test("enqueueBasicAnalysis rejects content without cleaned markdown", async () => {
  const result = await enqueueBasicAnalysisImpl(
    { contentId: "content-1", recordMode: "new-record" },
    {
      getContentState: async () => ({
        id: "content-1",
        cleanedMd: null,
      }),
      hasBasicAnalysisRecord: async () => false,
      enqueueJob: async () => {
        throw new Error("should not enqueue");
      },
    },
  );

  expect(result).toEqual({
    success: false,
    message: "Requires normalized content before queuing basic analysis.",
  });
});

test("enqueueHeavyAnalysis rejects content without a basic analysis record", async () => {
  const result = await enqueueHeavyAnalysisImpl(
    { contentId: "content-1", recordMode: "new-record" },
    {
      getContentState: async () => ({
        id: "content-1",
        cleanedMd: "# normalized",
      }),
      hasBasicAnalysisRecord: async () => false,
      enqueueJob: async () => {
        throw new Error("should not enqueue");
      },
    },
  );

  expect(result).toEqual({
    success: false,
    message: "Requires at least one basic analysis record before queuing heavy analysis.",
  });
});

test("enqueueBasicAnalysis returns a clear queue failure message", async () => {
  const result = await enqueueBasicAnalysisImpl(
    { contentId: "content-1", recordMode: "new-record" },
    {
      getContentState: async () => ({
        id: "content-1",
        cleanedMd: "# normalized",
      }),
      hasBasicAnalysisRecord: async () => false,
      enqueueJob: async () => {
        throw new Error("Redis is unavailable");
      },
    },
  );

  expect(result).toEqual({
    success: false,
    message: "Failed to queue basic analysis: Redis is unavailable",
  });
});

test("enqueueFullAiFlow reuses the basic analysis entry step", async () => {
  const enqueuedJobs: Array<{ data: Record<string, unknown>; taskName: string }> = [];

  const result = await enqueueFullAiFlowImpl(
    { contentId: "content-1", recordMode: "overwrite", variantTag: "api-b" },
    {
      getContentState: async () => ({
        id: "content-1",
        cleanedMd: "# normalized",
      }),
      hasBasicAnalysisRecord: async () => true,
      enqueueJob: async (taskName, data) => {
        enqueuedJobs.push({ taskName, data });
      },
    },
  );

  expect(result).toEqual({
    success: true,
    message:
      "Full AI flow entry job queued for overwrite (api-b). Heavy analysis will continue only if the basic score passes threshold.",
  });
  expect(enqueuedJobs[0]?.taskName).toBe("content.analyze.basic");
  expect(enqueuedJobs[0]?.data).toMatchObject({
    contentId: "content-1",
    debugOptions: {
      continueToHeavy: true,
      recordMode: "overwrite",
      rerunKey: null,
      variantTag: "api-b",
    },
    trigger: "content.normalize",
  });
});

test("enqueueBasicAnalysis disables heavy continuation for debug-only basic runs", async () => {
  const enqueuedJobs: Array<{ data: Record<string, unknown>; taskName: string }> = [];

  const result = await enqueueBasicAnalysisImpl(
    { contentId: "content-1", recordMode: "overwrite", variantTag: "api-b" },
    {
      getContentState: async () => ({
        id: "content-1",
        cleanedMd: "# normalized",
      }),
      hasBasicAnalysisRecord: async () => true,
      enqueueJob: async (taskName, data) => {
        enqueuedJobs.push({ taskName, data });
      },
    },
  );

  expect(result.success).toBe(true);
  expect(enqueuedJobs[0]?.data).toMatchObject({
    contentId: "content-1",
    debugOptions: {
      continueToHeavy: false,
      recordMode: "overwrite",
      rerunKey: null,
      variantTag: "api-b",
    },
    trigger: "content.normalize",
  });
});

test("enqueueHeavyAnalysis returns content-not-found before checking prerequisites", async () => {
  let prerequisiteChecks = 0;

  const result = await enqueueHeavyAnalysisImpl(
    { contentId: "content-404", recordMode: "new-record" },
    {
      getContentState: async () => null,
      hasBasicAnalysisRecord: async () => {
        prerequisiteChecks += 1;
        return true;
      },
      enqueueJob: async () => {
        throw new Error("should not enqueue");
      },
    },
  );

  expect(result).toEqual({
    success: false,
    message: "Content not found.",
  });
  expect(prerequisiteChecks).toBe(0);
});
