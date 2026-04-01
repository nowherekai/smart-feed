/**
 * AI 分析业务服务模块
 * 负责驱动内容的分层分析逻辑：
 * 1. 基础分析 (Basic Analysis): 生成分类、关键词、价值评分。
 * 2. 深度摘要 (Heavy Summary): 针对高价值内容生成详细摘要和证据片段。
 *
 * 包含：AI 任务配置解析、分析记录缓存检查、结果持久化、可追溯性校验及流水线状态推进。
 */

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
import { smartFeedTaskNames } from "../queue";
import type { ContentAnalyzeBasicJobData, ContentAnalyzeHeavyJobData } from "./content";
import { canEnterDigest } from "./traceability";

// 类型定义
type AnalysisRecord = typeof analysisRecords.$inferSelect;
type NewAnalysisRecord = typeof analysisRecords.$inferInsert;
type ContentItemRecord = typeof contentItems.$inferSelect;
type ContentItemUpdate = Partial<Omit<typeof contentItems.$inferInsert, "id" | "sourceId">>;
type SourceRecord = typeof sources.$inferSelect;

type ContentForAnalysis = {
  content: ContentItemRecord;
  source: SourceRecord;
};

/** 基础分析流水线业务载荷 */
export type ContentAnalyzeBasicPayload = {
  /** 生成的分析记录 ID */
  analysisRecordId: string | null;
  /** 是否命中了缓存 */
  cached: boolean;
  contentId: string;
  /** 使用的模型策略 */
  modelStrategy: string | null;
  promptVersion: string;
  /** AI 运行时状态 */
  runtimeState: ResolvedAiTaskConfig["runtimeState"];
  /** 价值评分是否超过了阈值，决定是否触发深度分析 */
  thresholdExceeded: boolean;
  /** 最终的价值评分 */
  valueScore: number | null;
};

/** 深度摘要流水线业务载荷 */
export type ContentAnalyzeHeavyPayload = {
  analysisRecordId: string | null;
  cached: boolean;
  contentId: string;
  /** 是否符合进入摘要报告的标准（可追溯性校验通过） */
  digestEligible: boolean;
  /** 验证并规范化后的证据片段 */
  evidenceSnippet: string | null;
  modelStrategy: string | null;
  promptVersion: string;
  runtimeState: ResolvedAiTaskConfig["runtimeState"];
  /** 分析状态：full (完整) 或 rejected (不合规) */
  status: "full" | "rejected" | null;
};

// 依赖项定义
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

// --- 辅助函数 ---

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

/** 获取人类可读的来源名称 */
function getSourceName(source: SourceRecord): string {
  return source.title ?? source.siteUrl ?? source.identifier;
}

/** 获取人类可读的内容标题 */
function getContentTitle(content: ContentItemRecord): string {
  return content.title ?? content.originalUrl;
}

// 缺省/错误载荷构建
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

/**
 * 规范化证据片段
 * 若 AI 返回的片段在正文中找不到，则降级取正文前 200 字。
 */
function normalizeEvidenceSnippet(cleanedMd: string, evidenceSnippet: string): string {
  const normalizedSnippet = evidenceSnippet.trim();

  if (normalizedSnippet && cleanedMd.includes(normalizedSnippet)) {
    return normalizedSnippet;
  }

  return cleanedMd.replace(/\s+/g, " ").trim().slice(0, 200).trim();
}

// --- 数据库操作 ---

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

// --- 依赖构建 ---

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

/**
 * 基础分析任务业务逻辑 (Task 5)
 * 1. 检查缓存：若已有同模型、同 Prompt 的基础分析记录，直接复用。
 * 2. 缓存未命中：调用 AI (OpenRouter/Dummy) 生成分类、关键词和评分。
 * 3. 存储分析记录 (status="basic")。
 * 4. 判定评分：
 *    - 若评分 > 阈值 (默认6)，入队下一步：深度摘要 (content.analyze.heavy)。
 *    - 若评分 <= 阈值，推进内容状态至 analyzed，流水线在此对该文章结束。
 */
export async function runContentAnalyzeBasic(
  jobData: ContentAnalyzeBasicJobData,
  overrides: ContentAnalyzeBasicDeps = {},
): Promise<PipelineStepResult<ContentAnalyzeBasicPayload, ContentAnalyzeHeavyJobData>> {
  const deps = buildBasicDeps(overrides);
  const record = await deps.getContentForAnalysisById(jobData.contentId);

  // 1. 数据校验
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

  // 2. 配置解析
  let taskConfig: ResolvedAiTaskConfig;
  try {
    taskConfig = deps.resolveBasicTaskConfig();
  } catch (error) {
    const message = toErrorMessage(error);
    await deps.updateContentItem(record.content.id, { processingError: message, status: "failed" });
    return buildContentStepFailure(message, {
      ...buildMissingContentPayload(record.content.id),
      runtimeState: "openrouter",
    });
  }

  if (taskConfig.runtimeState === "disabled" || taskConfig.modelStrategy === null) {
    const message = "[services/analysis] AI provider is not configured for content.analyze.basic.";
    await deps.updateContentItem(record.content.id, { processingError: message, status: "failed" });
    return buildContentStepFailure(message, {
      ...buildMissingContentPayload(record.content.id),
      promptVersion: taskConfig.promptVersion,
      runtimeState: taskConfig.runtimeState,
    });
  }

  // 3. 缓存检查
  const cachedRecord = await deps.findAnalysisRecord(
    record.content.id,
    taskConfig.modelStrategy,
    taskConfig.promptVersion,
  );

  if (cachedRecord) {
    const thresholdExceeded = cachedRecord.valueScore > deps.appEnv.valueScoreThreshold;

    if (!thresholdExceeded) {
      await deps.updateContentItem(record.content.id, { processingError: null, status: "analyzed" });
    } else {
      await deps.updateContentItem(record.content.id, { processingError: null });
    }

    return createCompletedStepResult<ContentAnalyzeBasicPayload, ContentAnalyzeHeavyJobData>({
      message: "content.analyze.basic cache hit",
      nextStep: thresholdExceeded
        ? {
            data: { contentId: record.content.id, trigger: "content.analyze.basic" },
            jobName: smartFeedTaskNames.contentAnalyzeHeavy,
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

  // 4. 执行 AI 分析
  try {
    const sourceName = getSourceName(record.source);
    const basicAnalysis = await deps.runBasicAnalysis({
      cleanedMd: record.content.cleanedMd,
      originalUrl: record.content.originalUrl,
      sourceName,
      title: getContentTitle(record.content),
    });

    // 5. 存储结果
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

    // 更新内容状态
    if (!thresholdExceeded) {
      await deps.updateContentItem(record.content.id, { processingError: null, status: "analyzed" });
    } else {
      await deps.updateContentItem(record.content.id, { processingError: null });
    }

    return createCompletedStepResult<ContentAnalyzeBasicPayload, ContentAnalyzeHeavyJobData>({
      nextStep: thresholdExceeded
        ? {
            data: { contentId: record.content.id, trigger: "content.analyze.basic" },
            jobName: smartFeedTaskNames.contentAnalyzeHeavy,
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
    await deps.updateContentItem(record.content.id, { processingError: message, status: "failed" });
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

/**
 * 深度摘要任务业务逻辑 (Task 5)
 * 1. 检查缓存：同模型、同 Prompt 的深度摘要记录。
 * 2. 依赖检查：必须已存在基础分析记录。
 * 3. 调用 AI 生成一句话摘要、要点列表、理由及证据。
 * 4. 可追溯性校验 (canEnterDigest)：验证所有关键元数据是否齐全。
 * 5. 存储分析记录 (status="full" 或 "rejected")。
 * 6. 无论成功与否，均推进内容状态至 analyzed，结束单篇文章的处理。
 */
export async function runContentAnalyzeHeavy(
  jobData: ContentAnalyzeHeavyJobData,
  overrides: ContentAnalyzeHeavyDeps = {},
): Promise<PipelineStepResult<ContentAnalyzeHeavyPayload>> {
  const deps = buildHeavyDeps(overrides);
  const record = await deps.getContentForAnalysisById(jobData.contentId);

  // 1. 数据校验
  if (!record) {
    return buildContentStepFailure(
      `[services/analysis] Content "${jobData.contentId}" not found.`,
      buildMissingHeavyPayload(jobData.contentId),
    );
  }

  if (!record.content.cleanedMd?.trim()) {
    const message = `[services/analysis] Content "${record.content.id}" has no cleaned markdown for heavy analysis.`;
    await deps.updateContentItem(record.content.id, { processingError: message, status: "failed" });
    return buildContentStepFailure(message, {
      ...buildMissingHeavyPayload(record.content.id),
      runtimeState: "disabled",
    });
  }

  // 2. 配置解析
  let taskConfig: ResolvedAiTaskConfig;
  try {
    taskConfig = deps.resolveHeavyTaskConfig();
  } catch (error) {
    const message = toErrorMessage(error);
    await deps.updateContentItem(record.content.id, { processingError: message, status: "failed" });
    return buildContentStepFailure(message, {
      ...buildMissingHeavyPayload(record.content.id),
      runtimeState: "openrouter",
    });
  }

  if (taskConfig.runtimeState === "disabled" || taskConfig.modelStrategy === null) {
    const message = "[services/analysis] AI provider is not configured for content.analyze.heavy.";
    await deps.updateContentItem(record.content.id, { processingError: message, status: "failed" });
    return buildContentStepFailure(message, {
      ...buildMissingHeavyPayload(record.content.id),
      promptVersion: taskConfig.promptVersion,
      runtimeState: taskConfig.runtimeState,
    });
  }

  // 3. 缓存检查
  const cachedRecord = await deps.findAnalysisRecord(
    record.content.id,
    taskConfig.modelStrategy,
    taskConfig.promptVersion,
  );

  if (cachedRecord) {
    const cachedStatus = cachedRecord.status === "rejected" ? "rejected" : "full";
    await deps.updateContentItem(record.content.id, { processingError: null, status: "analyzed" });

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

  // 4. 前序依赖检查 (Basic Record)
  const basicRecord = await deps.findLatestBasicAnalysisRecordByContentId(record.content.id);

  if (!basicRecord) {
    const message = `[services/analysis] Content "${record.content.id}" is missing a basic analysis record before heavy analysis.`;
    await deps.updateContentItem(record.content.id, { processingError: message, status: "failed" });
    return buildContentStepFailure(message, {
      ...buildMissingHeavyPayload(record.content.id),
      promptVersion: taskConfig.promptVersion,
      runtimeState: taskConfig.runtimeState,
    });
  }

  // 5. 执行 AI 深度分析
  try {
    const sourceName = getSourceName(record.source);
    const heavySummary = await deps.runHeavySummary({
      cleanedMd: record.content.cleanedMd,
      originalUrl: record.content.originalUrl,
      sourceName,
      title: getContentTitle(record.content),
    });

    // 6. 证据校验与可追溯性判定
    const evidenceSnippet = normalizeEvidenceSnippet(record.content.cleanedMd, heavySummary.evidenceSnippet);
    const digestEligible = canEnterDigest({
      contentTraceId: basicRecord.contentTraceId ?? record.content.id,
      evidenceSnippet,
      originalUrl: record.content.originalUrl,
      sourceName,
      sourceTraceId: basicRecord.sourceTraceId ?? record.source.id,
    });

    const analysisStatus = digestEligible ? "full" : "rejected";

    // 7. 存储结果（合并前序基础分析的部分字段）
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

    // 推进状态至终点
    await deps.updateContentItem(record.content.id, { processingError: null, status: "analyzed" });

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
    await deps.updateContentItem(record.content.id, { processingError: message, status: "failed" });
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
