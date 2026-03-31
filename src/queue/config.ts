import type { DefaultJobOptions } from "bullmq";

export const queueName = "smart-feed";

export const jobNames = {
  schedulerSourcesSync: "scheduler.sources.sync",
  sourceImport: "source.import",
  sourceFetch: "source.fetch",
  contentFetchHtml: "content.fetch-html",
  contentNormalize: "content.normalize",
  contentAnalyzeBasic: "content.analyze.basic",
  contentAnalyzeHeavy: "content.analyze.heavy",
  digestCompose: "digest.compose",
  digestDeliver: "digest.deliver",
} as const;

export type JobName = (typeof jobNames)[keyof typeof jobNames];

export function buildSourceFetchDeduplicationId(sourceId: string): string {
  return `${jobNames.sourceFetch}:${sourceId}`;
}

export const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1_000,
  },
  removeOnComplete: 100,
  removeOnFail: 500,
} satisfies DefaultJobOptions;

export const workerConcurrency = 4;
