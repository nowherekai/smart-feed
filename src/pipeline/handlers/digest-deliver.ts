import type { Job } from "bullmq";
import type { JobName } from "../../queue";
import type { DigestDeliverJobData } from "../../services/digest";
import { type DigestDeliverPayload, runDigestDeliver } from "../../services/digest-delivery";
import { type DigestPipelineRuntimeDeps, executeDigestPipelineStep } from "../../services/digest-pipeline-runtime";
import type { PipelineStepExecutionResult } from "../types";

export type DigestDeliverPipelineResult = PipelineStepExecutionResult<DigestDeliverPayload>;

export function createDigestDeliverHandler(
  runDeliver: (jobData: DigestDeliverJobData) => ReturnType<typeof runDigestDeliver> = runDigestDeliver,
  runtimeDeps?: DigestPipelineRuntimeDeps,
) {
  return async function digestDeliverHandler(
    job: Job<DigestDeliverJobData, DigestDeliverPipelineResult, JobName>,
  ): Promise<DigestDeliverPipelineResult> {
    return executeDigestPipelineStep({
      deps: runtimeDeps,
      jobData: job.data,
      jobName: job.name,
      resolveDigestId(result) {
        return typeof result.payload?.digestId === "string" ? result.payload.digestId : null;
      },
      runStep: runDeliver,
    });
  };
}

export const digestDeliverHandler = createDigestDeliverHandler();
