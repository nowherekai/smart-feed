import { expect, test } from "bun:test";

import { createContentNormalizeHandler } from "./content-normalize";

test("contentNormalizeHandler returns normalize summary with job name", async () => {
  const handler = createContentNormalizeHandler(async (jobData) => ({
    analyzeQueued: true,
    contentId: jobData.contentId,
    markdownBytes: 128,
    status: "completed",
    truncated: false,
  }));

  const result = await handler({
    data: {
      contentId: "content-1",
      trigger: "content.fetch-html",
    },
    name: "content.normalize",
  } as never);

  expect(result).toEqual({
    analyzeQueued: true,
    contentId: "content-1",
    jobName: "content.normalize",
    markdownBytes: 128,
    status: "completed",
    truncated: false,
  });
});
