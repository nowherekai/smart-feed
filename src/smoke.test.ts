import { expect, test } from "bun:test";

import { jobNames, queueName } from "./queue";

test("queue skeleton exports expected job names", () => {
  expect(queueName).toBe("smart-feed");
  expect(jobNames.sourceImport).toBe("source.import");
  expect(jobNames.digestDeliver).toBe("digest.deliver");
});
