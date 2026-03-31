import type { Job, Queue } from "bullmq";

import { buildSourceFetchDeduplicationId, createQueue, type JobName, jobNames } from "../../queue";
import type { SourceFetchJobData } from "../../services/content";
import { listActiveSourceIds } from "../../services/source";

export type SchedulerSourcesSyncJobData = {
  trigger: "scheduler";
};

export type SchedulerSourcesSyncPipelineResult = {
  jobName: string;
  queuedSourceCount: number;
  scannedSourceCount: number;
};

export type SchedulerSourcesSyncDeps = {
  createQueue?: () => Queue<SourceFetchJobData, unknown, string>;
  listActiveSourceIds?: () => Promise<string[]>;
};

async function enqueueSourceFetch(
  queue: Queue<SourceFetchJobData, unknown, string>,
  sourceId: string,
): Promise<boolean> {
  const deduplicationId = buildSourceFetchDeduplicationId(sourceId);
  const existingJobId = await queue.getDeduplicationJobId(deduplicationId);

  if (existingJobId) {
    return false;
  }

  await queue.add(
    jobNames.sourceFetch,
    {
      sourceId,
      trigger: "scheduler",
    },
    {
      deduplication: {
        id: deduplicationId,
      },
    },
  );

  return true;
}

export function createSchedulerSourcesSyncHandler(deps: SchedulerSourcesSyncDeps = {}) {
  const getActiveSourceIds = deps.listActiveSourceIds ?? listActiveSourceIds;
  const createSourceFetchQueue = deps.createQueue ?? (() => createQueue<SourceFetchJobData>());

  return async function schedulerSourcesSyncHandler(
    job: Job<SchedulerSourcesSyncJobData, SchedulerSourcesSyncPipelineResult, JobName>,
  ): Promise<SchedulerSourcesSyncPipelineResult> {
    const sourceIds = await getActiveSourceIds();
    const queue = createSourceFetchQueue();

    let queuedSourceCount = 0;

    for (const sourceId of sourceIds) {
      if (await enqueueSourceFetch(queue, sourceId)) {
        queuedSourceCount += 1;
      }
    }

    return {
      jobName: job.name,
      queuedSourceCount,
      scannedSourceCount: sourceIds.length,
    };
  };
}

export const schedulerSourcesSyncHandler = createSchedulerSourcesSyncHandler();
