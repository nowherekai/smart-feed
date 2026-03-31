import { expect, test } from "bun:test";

import { createContentFetchHtmlHandler } from "./content-fetch-html";

test("contentFetchHtmlHandler returns fetch summary with job name", async () => {
  const handler = createContentFetchHtmlHandler(async (jobData) => ({
    contentId: jobData.contentId,
    fetched: true,
    normalizeQueued: true,
    status: "completed",
    usedFallback: false,
  }));

  const result = await handler({
    data: {
      contentId: "content-1",
      trigger: "source.fetch",
    },
    name: "content.fetch-html",
  } as never);

  expect(result).toEqual({
    contentId: "content-1",
    fetched: true,
    jobName: "content.fetch-html",
    normalizeQueued: true,
    status: "completed",
    usedFallback: false,
  });
});
