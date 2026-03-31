import type { Job } from "bullmq";
import type { JobName } from "../../queue";
import { type DigestComposeJobData, type DigestComposePayload, runDigestCompose } from "../../services/digest";
import { type DigestPipelineRuntimeDeps, executeDigestPipelineStep } from "../../services/digest-pipeline-runtime";
import type { PipelineStepExecutionResult } from "../types";

export type DigestComposePipelineResult = PipelineStepExecutionResult<DigestComposePayload>;

export function createDigestComposeHandler(
  runCompose: (jobData: DigestComposeJobData) => ReturnType<typeof runDigestCompose> = runDigestCompose,
  runtimeDeps?: DigestPipelineRuntimeDeps,
) {
  return async function digestComposeHandler(
    job: Job<DigestComposeJobData, DigestComposePipelineResult, JobName>,
  ): Promise<DigestComposePipelineResult> {
    return executeDigestPipelineStep({
      deps: runtimeDeps,
      jobData: job.data,
      jobName: job.name,
      resolveDigestId(result) {
        return typeof result.payload?.digestId === "string" ? result.payload.digestId : null;
      },
      runStep: runCompose,
    });
  };
}

export const digestComposeHandler = createDigestComposeHandler();
