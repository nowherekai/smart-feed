import { expect, test } from "bun:test";

import { createSourceFetchHandler } from "./source-fetch";

test("sourceFetchHandler returns source fetch summary with job name", async () => {
  const handler = createSourceFetchHandler(async (jobData) => ({
    createdCount: 2,
    duplicateCount: 1,
    fetchedCount: 3,
    queuedCount: 2,
    sentinelCount: 1,
    sourceId: jobData.sourceId,
    status: "completed",
  }));

  const result = await handler({
    data: {
      sourceId: "source-1",
      trigger: "scheduler",
    },
    name: "source.fetch",
  } as never);

  expect(result).toEqual({
    createdCount: 2,
    duplicateCount: 1,
    fetchedCount: 3,
    jobName: "source.fetch",
    queuedCount: 2,
    sentinelCount: 1,
    sourceId: "source-1",
    status: "completed",
  });
});
