"use server";

import {
  type ContentDebugActionInput,
  type ContentDebugActionResult,
  enqueueBasicAnalysisImpl,
  enqueueFullAiFlowImpl,
  enqueueHeavyAnalysisImpl,
} from "./content-debug-action-impl";

export async function enqueueBasicAnalysis(input: ContentDebugActionInput): Promise<ContentDebugActionResult> {
  return await enqueueBasicAnalysisImpl(input);
}

export async function enqueueHeavyAnalysis(input: ContentDebugActionInput): Promise<ContentDebugActionResult> {
  return await enqueueHeavyAnalysisImpl(input);
}

export async function enqueueFullAiFlow(input: ContentDebugActionInput): Promise<ContentDebugActionResult> {
  return await enqueueFullAiFlowImpl(input);
}
