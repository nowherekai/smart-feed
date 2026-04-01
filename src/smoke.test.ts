import { expect, test } from "bun:test";

import { legacyImportQueueName, queueNames, smartFeedTaskNames } from "./queue";

test("queue skeleton exports expected task names and queue names", () => {
  expect(legacyImportQueueName).toBe("smart-feed");
  expect(queueNames.ingestion).toBe("ingestion-queue");
  expect(smartFeedTaskNames.sourceImport).toBe("source.import");
  expect(smartFeedTaskNames.digestDeliver).toBe("digest.deliver");
});
