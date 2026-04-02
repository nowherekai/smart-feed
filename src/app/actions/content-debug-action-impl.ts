import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { analysisRecords, contentItems } from "@/db/schema";
import { normalizeDebugVariantTag } from "@/lib/debug-run";
import { getQueueForTask, type SmartFeedTaskName, smartFeedTaskNames } from "@/queue";
import type {
  ContentAnalysisDebugMode,
  ContentAnalyzeBasicJobData,
  ContentAnalyzeHeavyJobData,
} from "@/services/content";
import { logger } from "@/utils";

export type ContentDebugActionResult = {
  success: boolean;
  message: string;
};

export type ContentDebugActionInput = {
  contentId: string;
  recordMode: ContentAnalysisDebugMode;
  variantTag?: string | null;
};

export type ContentDebugActionDeps = {
  enqueueJob?: (taskName: SmartFeedTaskName, data: Record<string, unknown>) => Promise<void>;
  getContentState?: (contentId: string) => Promise<{ cleanedMd: string | null; id: string } | null>;
  hasBasicAnalysisRecord?: (contentId: string) => Promise<boolean>;
};

async function getContentState(contentId: string): Promise<{ cleanedMd: string | null; id: string } | null> {
  const [record] = await db
    .select({
      id: contentItems.id,
      cleanedMd: contentItems.cleanedMd,
    })
    .from(contentItems)
    .where(eq(contentItems.id, contentId));

  return record ?? null;
}

async function hasBasicAnalysisRecord(contentId: string): Promise<boolean> {
  const [record] = await db
    .select({
      id: analysisRecords.id,
    })
    .from(analysisRecords)
    .where(and(eq(analysisRecords.contentId, contentId), eq(analysisRecords.status, "basic")));

  return Boolean(record);
}

async function enqueueJob(taskName: SmartFeedTaskName, data: Record<string, unknown>): Promise<void> {
  const queue = getQueueForTask<Record<string, unknown>>(taskName);
  await queue.add(taskName, data);
}

function buildDeps(overrides: ContentDebugActionDeps): Required<ContentDebugActionDeps> {
  return {
    enqueueJob: overrides.enqueueJob ?? enqueueJob,
    getContentState: overrides.getContentState ?? getContentState,
    hasBasicAnalysisRecord: overrides.hasBasicAnalysisRecord ?? hasBasicAnalysisRecord,
  };
}

function normalizeContentId(contentId: string): string | null {
  const normalizedContentId = contentId.trim();
  return normalizedContentId ? normalizedContentId : null;
}

function createRerunKey(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);

  return `${timestamp}-${random}`;
}

function buildDebugOptions(input: ContentDebugActionInput) {
  return {
    continueToHeavy: true,
    recordMode: input.recordMode,
    rerunKey: input.recordMode === "new-record" ? createRerunKey() : null,
    variantTag: normalizeDebugVariantTag(input.variantTag),
  } as const;
}

function summarizeDebugOptions(
  debugOptions: ContentAnalyzeBasicJobData["debugOptions"] | ContentAnalyzeHeavyJobData["debugOptions"] | undefined,
) {
  return debugOptions
    ? {
        continueToHeavy: debugOptions.continueToHeavy ?? false,
        hasRerunKey: Boolean(debugOptions.rerunKey),
        recordMode: debugOptions.recordMode,
        variantTag: debugOptions.variantTag ?? null,
      }
    : null;
}

function describeRunMode(input: ContentDebugActionInput): string {
  const modeLabel = input.recordMode === "new-record" ? "new record" : "overwrite";
  const variantTag = normalizeDebugVariantTag(input.variantTag);

  return variantTag ? `${modeLabel} (${variantTag})` : modeLabel;
}

function toFailureMessage(prefix: string, error: unknown): string {
  if (error instanceof Error && error.message) {
    return `${prefix}: ${error.message}`;
  }

  return `${prefix}: Unknown queue error.`;
}

export async function enqueueBasicAnalysisImpl(
  input: ContentDebugActionInput,
  deps: ContentDebugActionDeps = {},
): Promise<ContentDebugActionResult> {
  const normalizedContentId = normalizeContentId(input.contentId);
  const variantTag = normalizeDebugVariantTag(input.variantTag);

  logger.info("content debug action requested: basic", {
    contentId: normalizedContentId,
    originalContentId: input.contentId,
    recordMode: input.recordMode,
    variantTag,
  });

  if (!normalizedContentId) {
    logger.warn("content debug action rejected: basic missing contentId", {
      originalContentId: input.contentId,
    });
    return {
      success: false,
      message: "Content id is required.",
    };
  }

  const resolvedDeps = buildDeps(deps);
  const content = await resolvedDeps.getContentState(normalizedContentId);

  if (!content) {
    logger.warn("content debug action rejected: basic content not found", {
      contentId: normalizedContentId,
    });
    return {
      success: false,
      message: "Content not found.",
    };
  }

  logger.info("content debug action loaded content state: basic", {
    cleanedMdLength: content.cleanedMd?.length ?? 0,
    contentId: normalizedContentId,
    hasCleanedMd: Boolean(content.cleanedMd?.trim()),
  });

  if (!content.cleanedMd?.trim()) {
    logger.warn("content debug action rejected: basic requires normalized content", {
      contentId: normalizedContentId,
    });
    return {
      success: false,
      message: "Requires normalized content before queuing basic analysis.",
    };
  }

  const jobData: ContentAnalyzeBasicJobData = {
    contentId: normalizedContentId,
    debugOptions: {
      ...buildDebugOptions(input),
      continueToHeavy: false,
    },
    trigger: "content.normalize",
  };

  try {
    logger.info("content debug action enqueue started: basic", {
      contentId: normalizedContentId,
      debugOptions: summarizeDebugOptions(jobData.debugOptions),
      taskName: smartFeedTaskNames.contentAnalyzeBasic,
      trigger: jobData.trigger,
    });
    await resolvedDeps.enqueueJob(smartFeedTaskNames.contentAnalyzeBasic, jobData);
    logger.info("content debug action enqueue succeeded: basic", {
      contentId: normalizedContentId,
      debugOptions: summarizeDebugOptions(jobData.debugOptions),
      taskName: smartFeedTaskNames.contentAnalyzeBasic,
      trigger: jobData.trigger,
    });

    return {
      success: true,
      message: `Basic analysis job queued for ${describeRunMode(input)}.`,
    };
  } catch (error) {
    logger.error("content debug action enqueue failed: basic", {
      contentId: normalizedContentId,
      debugOptions: summarizeDebugOptions(jobData.debugOptions),
      error: error instanceof Error ? error.message : "Unknown queue error.",
      taskName: smartFeedTaskNames.contentAnalyzeBasic,
      trigger: jobData.trigger,
    });
    return {
      success: false,
      message: toFailureMessage("Failed to queue basic analysis", error),
    };
  }
}

export async function enqueueHeavyAnalysisImpl(
  input: ContentDebugActionInput,
  deps: ContentDebugActionDeps = {},
): Promise<ContentDebugActionResult> {
  const normalizedContentId = normalizeContentId(input.contentId);
  const variantTag = normalizeDebugVariantTag(input.variantTag);

  logger.info("content debug action requested: heavy", {
    contentId: normalizedContentId,
    originalContentId: input.contentId,
    recordMode: input.recordMode,
    variantTag,
  });

  if (!normalizedContentId) {
    logger.warn("content debug action rejected: heavy missing contentId", {
      originalContentId: input.contentId,
    });
    return {
      success: false,
      message: "Content id is required.",
    };
  }

  const resolvedDeps = buildDeps(deps);
  const content = await resolvedDeps.getContentState(normalizedContentId);

  if (!content) {
    logger.warn("content debug action rejected: heavy content not found", {
      contentId: normalizedContentId,
    });
    return {
      success: false,
      message: "Content not found.",
    };
  }

  logger.info("content debug action loaded content state: heavy", {
    cleanedMdLength: content.cleanedMd?.length ?? 0,
    contentId: normalizedContentId,
    hasCleanedMd: Boolean(content.cleanedMd?.trim()),
  });

  const canRunHeavy = await resolvedDeps.hasBasicAnalysisRecord(normalizedContentId);

  logger.info("content debug action checked heavy prerequisite", {
    canRunHeavy,
    contentId: normalizedContentId,
  });

  if (!canRunHeavy) {
    logger.warn("content debug action rejected: heavy requires basic analysis record", {
      contentId: normalizedContentId,
    });
    return {
      success: false,
      message: "Requires at least one basic analysis record before queuing heavy analysis.",
    };
  }

  const jobData: ContentAnalyzeHeavyJobData = {
    contentId: normalizedContentId,
    debugOptions: buildDebugOptions(input),
    trigger: "content.analyze.basic",
  };

  try {
    logger.info("content debug action enqueue started: heavy", {
      contentId: normalizedContentId,
      debugOptions: summarizeDebugOptions(jobData.debugOptions),
      taskName: smartFeedTaskNames.contentAnalyzeHeavy,
      trigger: jobData.trigger,
    });
    await resolvedDeps.enqueueJob(smartFeedTaskNames.contentAnalyzeHeavy, jobData);
    logger.info("content debug action enqueue succeeded: heavy", {
      contentId: normalizedContentId,
      debugOptions: summarizeDebugOptions(jobData.debugOptions),
      taskName: smartFeedTaskNames.contentAnalyzeHeavy,
      trigger: jobData.trigger,
    });

    return {
      success: true,
      message: `Heavy analysis job queued for ${describeRunMode(input)}.`,
    };
  } catch (error) {
    logger.error("content debug action enqueue failed: heavy", {
      contentId: normalizedContentId,
      debugOptions: summarizeDebugOptions(jobData.debugOptions),
      error: error instanceof Error ? error.message : "Unknown queue error.",
      taskName: smartFeedTaskNames.contentAnalyzeHeavy,
      trigger: jobData.trigger,
    });
    return {
      success: false,
      message: toFailureMessage("Failed to queue heavy analysis", error),
    };
  }
}

export async function enqueueFullAiFlowImpl(
  input: ContentDebugActionInput,
  deps: ContentDebugActionDeps = {},
): Promise<ContentDebugActionResult> {
  const normalizedContentId = normalizeContentId(input.contentId);
  const variantTag = normalizeDebugVariantTag(input.variantTag);

  logger.info("content debug action requested: full", {
    contentId: normalizedContentId,
    originalContentId: input.contentId,
    recordMode: input.recordMode,
    variantTag,
  });

  if (!normalizedContentId) {
    logger.warn("content debug action rejected: full missing contentId", {
      originalContentId: input.contentId,
    });
    return {
      success: false,
      message: "Content id is required.",
    };
  }

  const resolvedDeps = buildDeps(deps);
  const content = await resolvedDeps.getContentState(normalizedContentId);

  if (!content) {
    logger.warn("content debug action rejected: full content not found", {
      contentId: normalizedContentId,
    });
    return {
      success: false,
      message: "Content not found.",
    };
  }

  logger.info("content debug action loaded content state: full", {
    cleanedMdLength: content.cleanedMd?.length ?? 0,
    contentId: normalizedContentId,
    hasCleanedMd: Boolean(content.cleanedMd?.trim()),
  });

  if (!content.cleanedMd?.trim()) {
    logger.warn("content debug action rejected: full requires normalized content", {
      contentId: normalizedContentId,
    });
    return {
      success: false,
      message: "Requires normalized content before queuing the full AI flow.",
    };
  }

  const jobData: ContentAnalyzeBasicJobData = {
    contentId: normalizedContentId,
    debugOptions: {
      ...buildDebugOptions(input),
      continueToHeavy: true,
    },
    trigger: "content.normalize",
  };

  try {
    logger.info("content debug action enqueue started: full", {
      contentId: normalizedContentId,
      debugOptions: summarizeDebugOptions(jobData.debugOptions),
      taskName: smartFeedTaskNames.contentAnalyzeBasic,
      trigger: jobData.trigger,
    });
    await resolvedDeps.enqueueJob(smartFeedTaskNames.contentAnalyzeBasic, jobData);
    logger.info("content debug action enqueue succeeded: full", {
      contentId: normalizedContentId,
      debugOptions: summarizeDebugOptions(jobData.debugOptions),
      taskName: smartFeedTaskNames.contentAnalyzeBasic,
      trigger: jobData.trigger,
    });

    return {
      success: true,
      message: `Full AI flow entry job queued for ${describeRunMode(input)}. Heavy analysis will continue only if the basic score passes threshold.`,
    };
  } catch (error) {
    logger.error("content debug action enqueue failed: full", {
      contentId: normalizedContentId,
      debugOptions: summarizeDebugOptions(jobData.debugOptions),
      error: error instanceof Error ? error.message : "Unknown queue error.",
      taskName: smartFeedTaskNames.contentAnalyzeBasic,
      trigger: jobData.trigger,
    });
    return {
      success: false,
      message: toFailureMessage("Failed to queue the full AI flow", error),
    };
  }
}
