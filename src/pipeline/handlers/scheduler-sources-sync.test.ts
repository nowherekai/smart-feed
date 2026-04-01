import { expect, test } from "bun:test";

import { createSchedulerSourcesSyncHandler } from "./scheduler-sources-sync";

test("schedulerSourcesSyncHandler scans due sources and enqueues deduplicated source.fetch jobs", async () => {
  const queuedJobs: Array<{
    data: Record<string, unknown>;
    jobName: string;
    options: Record<string, unknown> | undefined;
  }> = [];

  const handler = createSchedulerSourcesSyncHandler({
    getSourceFetchQueue: () =>
      ({
        async getDeduplicationJobId() {
          return null;
        },
        async add(jobName: string, data: Record<string, unknown>, options?: Record<string, unknown>) {
          queuedJobs.push({
            data,
            jobName,
            options,
          });

          return {
            id: `${jobName}-${queuedJobs.length}`,
          };
        },
      }) as never,
    async listSourceIdsDueForSync() {
      return ["source-1", "source-2"];
    },
  });

  const result = await handler({
    data: {
      trigger: "scheduler",
    },
    name: "scheduler.sources.sync",
  } as never);

  expect(result).toEqual({
    jobName: "scheduler.sources.sync",
    queuedSourceCount: 2,
    scannedSourceCount: 2,
  });
  expect(queuedJobs).toEqual([
    {
      data: {
        sourceId: "source-1",
        trigger: "scheduler",
      },
      jobName: "source.fetch",
      options: {
        deduplication: {
          id: "source.fetch:source-1",
        },
      },
    },
    {
      data: {
        sourceId: "source-2",
        trigger: "scheduler",
      },
      jobName: "source.fetch",
      options: {
        deduplication: {
          id: "source.fetch:source-2",
        },
      },
    },
  ]);
});

test("schedulerSourcesSyncHandler does not overcount queuedSourceCount when deduplication is already active", async () => {
  const queuedJobs: string[] = [];

  const handler = createSchedulerSourcesSyncHandler({
    getSourceFetchQueue: () =>
      ({
        async getDeduplicationJobId(id: string) {
          return id === "source.fetch:source-2" ? "existing-job-2" : null;
        },
        async add(jobName: string) {
          queuedJobs.push(jobName);

          return {
            id: `${jobName}-${queuedJobs.length}`,
          };
        },
      }) as never,
    async listSourceIdsDueForSync() {
      return ["source-1", "source-2"];
    },
  });

  const result = await handler({
    data: {
      trigger: "scheduler",
    },
    name: "scheduler.sources.sync",
  } as never);

  expect(result).toEqual({
    jobName: "scheduler.sources.sync",
    queuedSourceCount: 1,
    scannedSourceCount: 2,
  });
  expect(queuedJobs).toEqual(["source.fetch"]);
});
