import { and, desc, eq } from "drizzle-orm";

import {
  type BasicAnalysis,
  type HeavySummary,
  type ResolvedAiTaskConfig,
  resolveAiTaskConfig,
  runBasicAnalysis,
  runHeavySummary,
} from "../ai";
import { type AppEnv, getAppEnv } from "../config";
import { analysisRecords, contentItems, getDb, sources } from "../db";
import { createCompletedStepResult, createFailedStepResult, type PipelineStepResult } from "../pipeline/types";
import { jobNames } from "../queue";
import type { ContentAnalyzeBasicJobData, ContentAnalyzeHeavyJobData } from "./content";
import { canEnterDigest } from "./traceability";

type AnalysisRecord = typeof analysisRecords.$inferSelect;
type NewAnalysisRecord = typeof analysisRecords.$inferInsert;
type ContentItemRecord = typeof contentItems.$inferSelect;
type ContentItemUpdate = Partial<Omit<typeof contentItems.$inferInsert, "id" | "sourceId">>;
type SourceRecord = typeof sources.$inferSelect;

type ContentForAnalysis = {
  content: ContentItemRecord;
  source: SourceRecord;
};

export type ContentAnalyzeBasicPayload = {
  analysisRecordId: string | null;
  cached: boolean;
  contentId: string;
  modelStrategy: string | null;
  promptVersion: string;
  runtimeState: ResolvedAiTaskConfig["runtimeState"];
  thresholdExceeded: boolean;
  valueScore: number | null;
};

export type ContentAnalyzeHeavyPayload = {
  analysisRecordId: string | null;
  cached: boolean;
  contentId: string;
  digestEligible: boolean;
  evidenceSnippet: string | null;
  modelStrategy: string | null;
  promptVersion: string;
  runtimeState: ResolvedAiTaskConfig["runtimeState"];
  status: "full" | "rejected" | null;
};

export type ContentAnalyzeBasicDeps = {
  appEnv?: Pick<AppEnv, "valueScoreThreshold">;
  createAnalysisRecord?: (data: NewAnalysisRecord) => Promise<AnalysisRecord>;
  findAnalysisRecord?: (
    contentId: string,
    modelStrategy: string,
    promptVersion: string,
  ) => Promise<AnalysisRecord | null>;
  getContentForAnalysisById?: (contentId: string) => Promise<ContentForAnalysis | null>;
  resolveBasicTaskConfig?: () => ResolvedAiTaskConfig;
  runBasicAnalysis?: (input: {
    cleanedMd: string;
    originalUrl: string;
    sourceName: string;
    title: string;
  }) => Promise<BasicAnalysis>;
  updateContentItem?: (contentId: string, data: ContentItemUpdate) => Promise<void>;
};

export type ContentAnalyzeHeavyDeps = {
  createAnalysisRecord?: (data: NewAnalysisRecord) => Promise<AnalysisRecord>;
  findAnalysisRecord?: (
    contentId: string,
    modelStrategy: string,
    promptVersion: string,
  ) => Promise<AnalysisRecord | null>;
  findLatestBasicAnalysisRecordByContentId?: (contentId: string) => Promise<AnalysisRecord | null>;
  getContentForAnalysisById?: (contentId: string) => Promise<ContentForAnalysis | null>;
  resolveHeavyTaskConfig?: () => ResolvedAiTaskConfig;
  runHeavySummary?: (input: {
    cleanedMd: string;
    originalUrl: string;
    sourceName: string;
    title: string;
  }) => Promise<HeavySummary>;
  updateContentItem?: (contentId: string, data: ContentItemUpdate) => Promise<void>;
};

function requireInsertedRow<T>(row: T | undefined, entityName: string): T {
  if (!row) {
    throw new Error(`[services/analysis] Failed to insert ${entityName}.`);
  }

  return row;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown content analysis error.";
}

function getSourceName(source: SourceRecord): string {
  return source.title ?? source.siteUrl ?? source.identifier;
}

function getContentTitle(content: ContentItemRecord): string {
  return content.title ?? content.originalUrl;
}

function buildMissingContentPayload(contentId: string) {
  return {
    analysisRecordId: null,
    cached: false,
    contentId,
    modelStrategy: null,
    promptVersion: "basic-analysis-v1",
    runtimeState: "disabled" as const,
    thresholdExceeded: false,
    valueScore: null,
  };
}

function buildMissingHeavyPayload(contentId: string) {
  return {
    analysisRecordId: null,
    cached: false,
    contentId,
    digestEligible: false,
    evidenceSnippet: null,
    modelStrategy: null,
    promptVersion: "heavy-summary-v1",
    runtimeState: "disabled" as const,
    status: null,
  };
}

function buildContentStepFailure<TPayload extends Record<string, unknown>, TNextData extends Record<string, unknown>>(
  message: string,
  payload: TPayload,
): PipelineStepResult<TPayload, TNextData> {
  return createFailedStepResult<TPayload, TNextData>({
    message,
    payload,
  });
}

function normalizeEvidenceSnippet(cleanedMd: string, evidenceSnippet: string): string {
  const normalizedSnippet = evidenceSnippet.trim();

  if (normalizedSnippet && cleanedMd.includes(normalizedSnippet)) {
    return normalizedSnippet;
  }

  return cleanedMd.replace(/\s+/g, " ").trim().slice(0, 200).trim();
}

async function getContentForAnalysisById(contentId: string): Promise<ContentForAnalysis | null> {
  const db = getDb();
  const [result] = await db
    .select({
      content: contentItems,
      source: sources,
    })
    .from(contentItems)
    .innerJoin(sources, eq(sources.id, contentItems.sourceId))
    .where(eq(contentItems.id, contentId));

  return result ?? null;
}

async function findAnalysisRecord(
  contentId: string,
  modelStrategy: string,
  promptVersion: string,
): Promise<AnalysisRecord | null> {
  const db = getDb();
  const [record] = await db
    .select()
    .from(analysisRecords)
    .where(
      and(
        eq(analysisRecords.contentId, contentId),
        eq(analysisRecords.modelStrategy, modelStrategy),
        eq(analysisRecords.promptVersion, promptVersion),
      ),
    );

  return record ?? null;
}

async function findLatestBasicAnalysisRecordByContentId(contentId: string): Promise<AnalysisRecord | null> {
  const db = getDb();
  const [record] = await db
    .select()
    .from(analysisRecords)
    .where(and(eq(analysisRecords.contentId, contentId), eq(analysisRecords.status, "basic")))
    .orderBy(desc(analysisRecords.createdAt));

  return record ?? null;
}

async function createAnalysisRecord(data: NewAnalysisRecord): Promise<AnalysisRecord> {
  const db = getDb();
  const [record] = await db.insert(analysisRecords).values(data).returning();

  return requireInsertedRow(record, "analysis record");
}

async function updateContentItem(contentId: string, data: ContentItemUpdate): Promise<void> {
  if (Object.keys(data).length === 0) {
    return;
  }

  const db = getDb();
  await db.update(contentItems).set(data).where(eq(contentItems.id, contentId));
}

function buildBasicDeps(overrides: ContentAnalyzeBasicDeps): Required<ContentAnalyzeBasicDeps> {
  return {
    appEnv: overrides.appEnv ?? getAppEnv(),
    createAnalysisRecord: overrides.createAnalysisRecord ?? createAnalysisRecord,
    findAnalysisRecord: overrides.findAnalysisRecord ?? findAnalysisRecord,
    getContentForAnalysisById: overrides.getContentForAnalysisById ?? getContentForAnalysisById,
    resolveBasicTaskConfig: overrides.resolveBasicTaskConfig ?? (() => resolveAiTaskConfig("basic")),
    runBasicAnalysis: overrides.runBasicAnalysis ?? runBasicAnalysis,
    updateContentItem: overrides.updateContentItem ?? updateContentItem,
  };
}

function buildHeavyDeps(overrides: ContentAnalyzeHeavyDeps): Required<ContentAnalyzeHeavyDeps> {
  return {
    createAnalysisRecord: overrides.createAnalysisRecord ?? createAnalysisRecord,
    findAnalysisRecord: overrides.findAnalysisRecord ?? findAnalysisRecord,
    findLatestBasicAnalysisRecordByContentId:
      overrides.findLatestBasicAnalysisRecordByContentId ?? findLatestBasicAnalysisRecordByContentId,
    getContentForAnalysisById: overrides.getContentForAnalysisById ?? getContentForAnalysisById,
    resolveHeavyTaskConfig: overrides.resolveHeavyTaskConfig ?? (() => resolveAiTaskConfig("heavy")),
    runHeavySummary: overrides.runHeavySummary ?? runHeavySummary,
    updateContentItem: overrides.updateContentItem ?? updateContentItem,
  };
}

export async function runContentAnalyzeBasic(
  jobData: ContentAnalyzeBasicJobData,
  overrides: ContentAnalyzeBasicDeps = {},
): Promise<PipelineStepResult<ContentAnalyzeBasicPayload, ContentAnalyzeHeavyJobData>> {
  const deps = buildBasicDeps(overrides);
  const record = await deps.getContentForAnalysisById(jobData.contentId);

  if (!record) {
    return buildContentStepFailure(
      `[services/analysis] Content "${jobData.contentId}" not found.`,
      buildMissingContentPayload(jobData.contentId),
    );
  }

  if (!record.content.cleanedMd?.trim()) {
    const message = `[services/analysis] Content "${record.content.id}" has no cleaned markdown for analysis.`;

    await deps.updateContentItem(record.content.id, {
      processingError: message,
      status: "failed",
    });

    return buildContentStepFailure(message, {
      ...buildMissingContentPayload(record.content.id),
      runtimeState: "disabled",
    });
  }

  let taskConfig: ResolvedAiTaskConfig;

  try {
    taskConfig = deps.resolveBasicTaskConfig();
  } catch (error) {
    const message = toErrorMessage(error);

    await deps.updateContentItem(record.content.id, {
      processingError: message,
      status: "failed",
    });

    return buildContentStepFailure(message, {
      ...buildMissingContentPayload(record.content.id),
      runtimeState: "openrouter",
    });
  }

  if (taskConfig.runtimeState === "disabled" || taskConfig.modelStrategy === null) {
    const message = "[services/analysis] AI provider is not configured for content.analyze.basic.";

    await deps.updateContentItem(record.content.id, {
      processingError: message,
      status: "failed",
    });

    return buildContentStepFailure(message, {
      ...buildMissingContentPayload(record.content.id),
      promptVersion: taskConfig.promptVersion,
      runtimeState: taskConfig.runtimeState,
    });
  }

  const cachedRecord = await deps.findAnalysisRecord(
    record.content.id,
    taskConfig.modelStrategy,
    taskConfig.promptVersion,
  );

  if (cachedRecord) {
    const thresholdExceeded = cachedRecord.valueScore > deps.appEnv.valueScoreThreshold;

    if (!thresholdExceeded) {
      await deps.updateContentItem(record.content.id, {
        processingError: null,
        status: "analyzed",
      });
    } else {
      await deps.updateContentItem(record.content.id, {
        processingError: null,
      });
    }

    return createCompletedStepResult<ContentAnalyzeBasicPayload, ContentAnalyzeHeavyJobData>({
      message: "content.analyze.basic cache hit",
      nextStep: thresholdExceeded
        ? {
            data: {
              contentId: record.content.id,
              trigger: "content.analyze.basic",
            },
            jobName: jobNames.contentAnalyzeHeavy,
          }
        : null,
      payload: {
        analysisRecordId: cachedRecord.id,
        cached: true,
        contentId: record.content.id,
        modelStrategy: cachedRecord.modelStrategy,
        promptVersion: cachedRecord.promptVersion,
        runtimeState: taskConfig.runtimeState,
        thresholdExceeded,
        valueScore: cachedRecord.valueScore,
      },
    });
  }

  try {
    const sourceName = getSourceName(record.source);
    const basicAnalysis = await deps.runBasicAnalysis({
      cleanedMd: record.content.cleanedMd,
      originalUrl: record.content.originalUrl,
      sourceName,
      title: getContentTitle(record.content),
    });
    const analysisRecord = await deps.createAnalysisRecord({
      categories: basicAnalysis.categories,
      contentId: record.content.id,
      contentTraceId: record.content.id,
      entities: basicAnalysis.entities,
      evidenceSnippet: null,
      keywords: basicAnalysis.keywords,
      language: basicAnalysis.language,
      modelStrategy: taskConfig.modelStrategy,
      originalUrl: record.content.originalUrl,
      promptVersion: taskConfig.promptVersion,
      sentiment: basicAnalysis.sentiment,
      sourceId: record.source.id,
      sourceName,
      sourceTraceId: record.source.id,
      status: "basic",
      summary: null,
      valueScore: basicAnalysis.valueScore,
    });
    const thresholdExceeded = basicAnalysis.valueScore > deps.appEnv.valueScoreThreshold;

    if (!thresholdExceeded) {
      await deps.updateContentItem(record.content.id, {
        processingError: null,
        status: "analyzed",
      });
    } else {
      await deps.updateContentItem(record.content.id, {
        processingError: null,
      });
    }

    return createCompletedStepResult<ContentAnalyzeBasicPayload, ContentAnalyzeHeavyJobData>({
      nextStep: thresholdExceeded
        ? {
            data: {
              contentId: record.content.id,
              trigger: "content.analyze.basic",
            },
            jobName: jobNames.contentAnalyzeHeavy,
          }
        : null,
      payload: {
        analysisRecordId: analysisRecord.id,
        cached: false,
        contentId: record.content.id,
        modelStrategy: taskConfig.modelStrategy,
        promptVersion: taskConfig.promptVersion,
        runtimeState: taskConfig.runtimeState,
        thresholdExceeded,
        valueScore: basicAnalysis.valueScore,
      },
    });
  } catch (error) {
    const message = toErrorMessage(error);

    await deps.updateContentItem(record.content.id, {
      processingError: message,
      status: "failed",
    });

    return buildContentStepFailure(message, {
      analysisRecordId: null,
      cached: false,
      contentId: record.content.id,
      modelStrategy: taskConfig.modelStrategy,
      promptVersion: taskConfig.promptVersion,
      runtimeState: taskConfig.runtimeState,
      thresholdExceeded: false,
      valueScore: null,
    });
  }
}

export async function runContentAnalyzeHeavy(
  jobData: ContentAnalyzeHeavyJobData,
  overrides: ContentAnalyzeHeavyDeps = {},
): Promise<PipelineStepResult<ContentAnalyzeHeavyPayload>> {
  const deps = buildHeavyDeps(overrides);
  const record = await deps.getContentForAnalysisById(jobData.contentId);

  if (!record) {
    return buildContentStepFailure(
      `[services/analysis] Content "${jobData.contentId}" not found.`,
      buildMissingHeavyPayload(jobData.contentId),
    );
  }

  if (!record.content.cleanedMd?.trim()) {
    const message = `[services/analysis] Content "${record.content.id}" has no cleaned markdown for heavy analysis.`;

    await deps.updateContentItem(record.content.id, {
      processingError: message,
      status: "failed",
    });

    return buildContentStepFailure(message, {
      ...buildMissingHeavyPayload(record.content.id),
      runtimeState: "disabled",
    });
  }

  let taskConfig: ResolvedAiTaskConfig;

  try {
    taskConfig = deps.resolveHeavyTaskConfig();
  } catch (error) {
    const message = toErrorMessage(error);

    await deps.updateContentItem(record.content.id, {
      processingError: message,
      status: "failed",
    });

    return buildContentStepFailure(message, {
      ...buildMissingHeavyPayload(record.content.id),
      runtimeState: "openrouter",
    });
  }

  if (taskConfig.runtimeState === "disabled" || taskConfig.modelStrategy === null) {
    const message = "[services/analysis] AI provider is not configured for content.analyze.heavy.";

    await deps.updateContentItem(record.content.id, {
      processingError: message,
      status: "failed",
    });

    return buildContentStepFailure(message, {
      ...buildMissingHeavyPayload(record.content.id),
      promptVersion: taskConfig.promptVersion,
      runtimeState: taskConfig.runtimeState,
    });
  }

  const cachedRecord = await deps.findAnalysisRecord(
    record.content.id,
    taskConfig.modelStrategy,
    taskConfig.promptVersion,
  );

  if (cachedRecord) {
    const cachedStatus = cachedRecord.status === "rejected" ? "rejected" : "full";

    await deps.updateContentItem(record.content.id, {
      processingError: null,
      status: "analyzed",
    });

    return createCompletedStepResult({
      message: "content.analyze.heavy cache hit",
      payload: {
        analysisRecordId: cachedRecord.id,
        cached: true,
        contentId: record.content.id,
        digestEligible: cachedStatus === "full",
        evidenceSnippet: cachedRecord.evidenceSnippet,
        modelStrategy: cachedRecord.modelStrategy,
        promptVersion: cachedRecord.promptVersion,
        runtimeState: taskConfig.runtimeState,
        status: cachedStatus,
      },
    });
  }

  const basicRecord = await deps.findLatestBasicAnalysisRecordByContentId(record.content.id);

  if (!basicRecord) {
    const message = `[services/analysis] Content "${record.content.id}" is missing a basic analysis record before heavy analysis.`;

    await deps.updateContentItem(record.content.id, {
      processingError: message,
      status: "failed",
    });

    return buildContentStepFailure(message, {
      ...buildMissingHeavyPayload(record.content.id),
      promptVersion: taskConfig.promptVersion,
      runtimeState: taskConfig.runtimeState,
    });
  }

  try {
    const sourceName = getSourceName(record.source);
    const heavySummary = await deps.runHeavySummary({
      cleanedMd: record.content.cleanedMd,
      originalUrl: record.content.originalUrl,
      sourceName,
      title: getContentTitle(record.content),
    });
    const evidenceSnippet = normalizeEvidenceSnippet(record.content.cleanedMd, heavySummary.evidenceSnippet);
    const digestEligible = canEnterDigest({
      contentTraceId: basicRecord.contentTraceId ?? record.content.id,
      evidenceSnippet,
      originalUrl: record.content.originalUrl,
      sourceName,
      sourceTraceId: basicRecord.sourceTraceId ?? record.source.id,
    });
    const analysisStatus = digestEligible ? "full" : "rejected";
    const analysisRecord = await deps.createAnalysisRecord({
      categories: basicRecord.categories,
      contentId: record.content.id,
      contentTraceId: basicRecord.contentTraceId ?? record.content.id,
      entities: basicRecord.entities,
      evidenceSnippet,
      keywords: basicRecord.keywords,
      language: basicRecord.language,
      modelStrategy: taskConfig.modelStrategy,
      originalUrl: record.content.originalUrl,
      promptVersion: taskConfig.promptVersion,
      sentiment: basicRecord.sentiment,
      sourceId: record.source.id,
      sourceName,
      sourceTraceId: basicRecord.sourceTraceId ?? record.source.id,
      status: analysisStatus,
      summary: {
        oneline: heavySummary.oneline,
        points: heavySummary.points,
        reason: heavySummary.reason,
      },
      valueScore: basicRecord.valueScore,
    });

    await deps.updateContentItem(record.content.id, {
      processingError: null,
      status: "analyzed",
    });

    return createCompletedStepResult({
      message: digestEligible ? null : "traceability incomplete; analysis marked as rejected",
      payload: {
        analysisRecordId: analysisRecord.id,
        cached: false,
        contentId: record.content.id,
        digestEligible,
        evidenceSnippet,
        modelStrategy: taskConfig.modelStrategy,
        promptVersion: taskConfig.promptVersion,
        runtimeState: taskConfig.runtimeState,
        status: analysisStatus,
      },
    });
  } catch (error) {
    const message = toErrorMessage(error);

    await deps.updateContentItem(record.content.id, {
      processingError: message,
      status: "failed",
    });

    return buildContentStepFailure(message, {
      analysisRecordId: null,
      cached: false,
      contentId: record.content.id,
      digestEligible: false,
      evidenceSnippet: null,
      modelStrategy: taskConfig.modelStrategy,
      promptVersion: taskConfig.promptVersion,
      runtimeState: taskConfig.runtimeState,
      status: null,
    });
  }
}
