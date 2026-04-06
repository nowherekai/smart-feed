/**
 * AI 分析业务服务模块
 * 负责驱动内容的分层分析逻辑：
 * 1. 基础分析 (Basic Analysis): 生成分类、关键词、价值评分。
 * 2. 深度摘要 (Heavy Summary): 针对高价值内容生成详细摘要。
 *
 * 包含：AI 任务配置解析、分析记录缓存检查、结果持久化及流水线状态推进。
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
import { normalizeDebugVariantTag } from "../lib/debug-run";
import { createCompletedStepResult, createFailedStepResult, type PipelineStepResult } from "../pipeline/types";
import { smartFeedTaskNames } from "../queue";
import { createLogger } from "../utils";
import type { ContentAnalysisDebugOptions, ContentAnalyzeBasicJobData, ContentAnalyzeHeavyJobData } from "./content";

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
const logger = createLogger("AnalysisService");

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
  modelStrategy: string | null;
  promptVersion: string;
  runtimeState: ResolvedAiTaskConfig["runtimeState"];
  /** 分析状态：仅保留完整深度摘要 */
  status: "full" | null;
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
  updateAnalysisRecord?: (id: string, data: Partial<Omit<NewAnalysisRecord, "id">>) => Promise<AnalysisRecord>;
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
  updateAnalysisRecord?: (id: string, data: Partial<Omit<NewAnalysisRecord, "id">>) => Promise<AnalysisRecord>;
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

async function updateAnalysisRecord(id: string, data: Partial<Omit<NewAnalysisRecord, "id">>): Promise<AnalysisRecord> {
  const db = getDb();
  const [record] = await db.update(analysisRecords).set(data).where(eq(analysisRecords.id, id)).returning();

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
    updateAnalysisRecord: overrides.updateAnalysisRecord ?? updateAnalysisRecord,
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
    updateAnalysisRecord: overrides.updateAnalysisRecord ?? updateAnalysisRecord,
    updateContentItem: overrides.updateContentItem ?? updateContentItem,
  };
}

function buildEffectivePromptVersion(promptVersion: string, debugOptions?: ContentAnalysisDebugOptions): string {
  if (!debugOptions) {
    return promptVersion;
  }

  const suffixParts = [normalizeDebugVariantTag(debugOptions.variantTag)];

  if (debugOptions.recordMode === "new-record" && debugOptions.rerunKey) {
    suffixParts.push(debugOptions.rerunKey);
  }

  const suffix = suffixParts.filter((part) => Boolean(part)).join("-");

  if (!suffix) {
    return promptVersion;
  }

  const maxSuffixLength = 64 - promptVersion.length - 1;

  if (maxSuffixLength <= 0) {
    return promptVersion;
  }

  return `${promptVersion}~${suffix.slice(0, maxSuffixLength)}`;
}

function shouldBypassCache(debugOptions?: ContentAnalysisDebugOptions): boolean {
  return debugOptions?.recordMode === "new-record" || debugOptions?.recordMode === "overwrite";
}

function buildHeavyJobData(contentId: string, debugOptions?: ContentAnalysisDebugOptions): ContentAnalyzeHeavyJobData {
  return debugOptions
    ? {
        contentId,
        debugOptions,
        trigger: "content.analyze.basic",
      }
    : {
        contentId,
        trigger: "content.analyze.basic",
      };
}

function shouldContinueToHeavy(thresholdExceeded: boolean, debugOptions?: ContentAnalysisDebugOptions): boolean {
  if (!thresholdExceeded) {
    return false;
  }

  if (!debugOptions) {
    return true;
  }

  return debugOptions.continueToHeavy === true;
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
  logger.info("runContentAnalyzeBasic started", {
    contentId: jobData.contentId,
    pipelineRunId: jobData.pipelineRunId,
    trigger: jobData.trigger,
  });

  const deps = buildBasicDeps(overrides);
  const record = await deps.getContentForAnalysisById(jobData.contentId);

  // 1. 数据校验
  if (!record) {
    const message = `[services/analysis] Content "${jobData.contentId}" not found.`;
    logger.error("Content not found", { contentId: jobData.contentId });
    return buildContentStepFailure(message, buildMissingContentPayload(jobData.contentId));
  }

  if (!record.content.cleanedMd?.trim()) {
    const message = `[services/analysis] Content "${record.content.id}" has no cleaned markdown for analysis.`;
    logger.warn("Content has no cleaned markdown for analysis", {
      contentId: record.content.id,
    });

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
    logger.error("Failed to resolve basic task config", {
      error: message,
      contentId: record.content.id,
    });
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
    logger.warn(message, {
      contentId: record.content.id,
      runtimeState: taskConfig.runtimeState,
    });
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

  const effectivePromptVersion = buildEffectivePromptVersion(taskConfig.promptVersion, jobData.debugOptions);

  // 3. 缓存检查
  const cachedRecord = await deps.findAnalysisRecord(
    record.content.id,
    taskConfig.modelStrategy,
    effectivePromptVersion,
  );

  if (cachedRecord && !shouldBypassCache(jobData.debugOptions)) {
    const thresholdExceeded = cachedRecord.valueScore > deps.appEnv.valueScoreThreshold;
    const shouldQueueHeavy = shouldContinueToHeavy(thresholdExceeded, jobData.debugOptions);

    logger.info("content.analyze.basic cache hit", {
      analysisRecordId: cachedRecord.id,
      contentId: record.content.id,
      shouldQueueHeavy,
      thresholdExceeded,
      valueScore: cachedRecord.valueScore,
    });

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
      nextStep: shouldQueueHeavy
        ? {
            data: buildHeavyJobData(record.content.id, jobData.debugOptions),
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
    logger.info("Running AI basic analysis", {
      contentId: record.content.id,
      modelStrategy: taskConfig.modelStrategy,
      promptVersion: effectivePromptVersion,
      sourceName,
    });

    const basicAnalysis = await deps.runBasicAnalysis({
      cleanedMd: record.content.cleanedMd,
      originalUrl: record.content.originalUrl,
      sourceName,
      title: getContentTitle(record.content),
    });

    logger.info("AI basic analysis completed", {
      contentId: record.content.id,
      language: basicAnalysis.language,
      valueScore: basicAnalysis.valueScore,
    });

    // 5. 存储结果
    const analysisRecordData: NewAnalysisRecord = {
      categories: basicAnalysis.categories,
      contentId: record.content.id,
      contentTraceId: record.content.id,
      entities: basicAnalysis.entities,
      keywords: basicAnalysis.keywords,
      language: basicAnalysis.language,
      modelStrategy: taskConfig.modelStrategy,
      originalUrl: record.content.originalUrl,
      promptVersion: effectivePromptVersion,
      sourceId: record.source.id,
      sourceName,
      sourceTraceId: record.source.id,
      status: "basic",
      summary: null,
      valueScore: basicAnalysis.valueScore,
    };
    const analysisRecord =
      cachedRecord && shouldBypassCache(jobData.debugOptions)
        ? await deps.updateAnalysisRecord(cachedRecord.id, {
            ...analysisRecordData,
            createdAt: new Date(),
          })
        : await deps.createAnalysisRecord(analysisRecordData);

    const thresholdExceeded = basicAnalysis.valueScore > deps.appEnv.valueScoreThreshold;
    const shouldQueueHeavy = shouldContinueToHeavy(thresholdExceeded, jobData.debugOptions);

    logger.info("Stored basic analysis record", {
      analysisRecordId: analysisRecord.id,
      shouldQueueHeavy,
      thresholdExceeded,
    });

    // 更新内容状态
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
      nextStep: shouldQueueHeavy
        ? {
            data: buildHeavyJobData(record.content.id, jobData.debugOptions),
            jobName: smartFeedTaskNames.contentAnalyzeHeavy,
          }
        : null,
      payload: {
        analysisRecordId: analysisRecord.id,
        cached: false,
        contentId: record.content.id,
        modelStrategy: taskConfig.modelStrategy,
        promptVersion: effectivePromptVersion,
        runtimeState: taskConfig.runtimeState,
        thresholdExceeded,
        valueScore: basicAnalysis.valueScore,
      },
    });
  } catch (error) {
    const message = toErrorMessage(error);
    logger.error("AI basic analysis failed", {
      error: message,
      contentId: record.content.id,
    });
    await deps.updateContentItem(record.content.id, {
      processingError: message,
      status: "failed",
    });
    return buildContentStepFailure(message, {
      analysisRecordId: null,
      cached: false,
      contentId: record.content.id,
      modelStrategy: taskConfig.modelStrategy,
      promptVersion: effectivePromptVersion,
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
 * 3. 调用 AI 生成整体摘要与段落摘要。
 * 4. 存储分析记录 (status="full")。
 * 5. 无论成功与否，均推进内容状态至 analyzed，结束单篇文章的处理。
 */
export async function runContentAnalyzeHeavy(
  jobData: ContentAnalyzeHeavyJobData,
  overrides: ContentAnalyzeHeavyDeps = {},
): Promise<PipelineStepResult<ContentAnalyzeHeavyPayload>> {
  logger.info("runContentAnalyzeHeavy started", {
    contentId: jobData.contentId,
    pipelineRunId: jobData.pipelineRunId,
    trigger: jobData.trigger,
  });

  const deps = buildHeavyDeps(overrides);
  const record = await deps.getContentForAnalysisById(jobData.contentId);

  // 1. 数据校验
  if (!record) {
    const message = `[services/analysis] Content "${jobData.contentId}" not found.`;
    logger.error("Content not found", { contentId: jobData.contentId });
    return buildContentStepFailure(message, buildMissingHeavyPayload(jobData.contentId));
  }

  if (!record.content.cleanedMd?.trim()) {
    const message = `[services/analysis] Content "${record.content.id}" has no cleaned markdown for heavy analysis.`;
    logger.warn("Content has no cleaned markdown for heavy analysis", {
      contentId: record.content.id,
    });
    await deps.updateContentItem(record.content.id, {
      processingError: message,
      status: "failed",
    });
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
    logger.error("Failed to resolve heavy task config", {
      error: message,
      contentId: record.content.id,
    });
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
    logger.warn(message, {
      contentId: record.content.id,
      runtimeState: taskConfig.runtimeState,
    });
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

  const effectivePromptVersion = buildEffectivePromptVersion(taskConfig.promptVersion, jobData.debugOptions);

  // 3. 缓存检查
  const cachedRecord = await deps.findAnalysisRecord(
    record.content.id,
    taskConfig.modelStrategy,
    effectivePromptVersion,
  );

  if (cachedRecord && !shouldBypassCache(jobData.debugOptions)) {
    logger.info("content.analyze.heavy cache hit", {
      analysisRecordId: cachedRecord.id,
      contentId: record.content.id,
      status: cachedRecord.status,
    });
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
        modelStrategy: cachedRecord.modelStrategy,
        promptVersion: cachedRecord.promptVersion,
        runtimeState: taskConfig.runtimeState,
        status: "full",
      },
    });
  }

  // 4. 前序依赖检查 (Basic Record)
  const basicRecord = await deps.findLatestBasicAnalysisRecordByContentId(record.content.id);

  if (!basicRecord) {
    const message = `[services/analysis] Content "${record.content.id}" is missing a basic analysis record before heavy analysis.`;
    logger.error("Content is missing a basic analysis record before heavy analysis", { contentId: record.content.id });
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

  // 5. 执行 AI 深度分析
  try {
    const sourceName = getSourceName(record.source);
    logger.info("Running AI heavy analysis", {
      contentId: record.content.id,
      modelStrategy: taskConfig.modelStrategy,
      promptVersion: effectivePromptVersion,
      sourceName,
    });

    const heavySummary = await deps.runHeavySummary({
      cleanedMd: record.content.cleanedMd,
      originalUrl: record.content.originalUrl,
      sourceName,
      title: getContentTitle(record.content),
    });

    logger.info("AI heavy analysis completed", {
      contentId: record.content.id,
      paragraphCount: heavySummary.paragraphSummaries.length,
    });

    // 6. 存储结果（合并前序基础分析的部分字段）
    const analysisRecordData: NewAnalysisRecord = {
      categories: basicRecord.categories,
      contentId: record.content.id,
      contentTraceId: basicRecord.contentTraceId ?? record.content.id,
      entities: basicRecord.entities,
      keywords: basicRecord.keywords,
      language: basicRecord.language,
      modelStrategy: taskConfig.modelStrategy,
      originalUrl: record.content.originalUrl,
      promptVersion: effectivePromptVersion,
      sourceId: record.source.id,
      sourceName,
      sourceTraceId: basicRecord.sourceTraceId ?? record.source.id,
      status: "full",
      summary: {
        paragraphSummaries: heavySummary.paragraphSummaries,
        summary: heavySummary.summary,
      },
      valueScore: basicRecord.valueScore,
    };
    const analysisRecord =
      cachedRecord && shouldBypassCache(jobData.debugOptions)
        ? await deps.updateAnalysisRecord(cachedRecord.id, {
            ...analysisRecordData,
            createdAt: new Date(),
          })
        : await deps.createAnalysisRecord(analysisRecordData);

    logger.info("Stored heavy analysis record", {
      analysisRecordId: analysisRecord.id,
      status: analysisRecordData.status,
    });

    // 推进状态至终点
    await deps.updateContentItem(record.content.id, {
      processingError: null,
      status: "analyzed",
    });

    return createCompletedStepResult({
      message: null,
      payload: {
        analysisRecordId: analysisRecord.id,
        cached: false,
        contentId: record.content.id,
        modelStrategy: taskConfig.modelStrategy,
        promptVersion: effectivePromptVersion,
        runtimeState: taskConfig.runtimeState,
        status: "full",
      },
    });
  } catch (error) {
    const message = toErrorMessage(error);
    logger.error("AI heavy analysis failed", {
      error: message,
      contentId: record.content.id,
    });
    await deps.updateContentItem(record.content.id, {
      processingError: message,
      status: "failed",
    });
    return buildContentStepFailure(message, {
      analysisRecordId: null,
      cached: false,
      contentId: record.content.id,
      modelStrategy: taskConfig.modelStrategy,
      promptVersion: effectivePromptVersion,
      runtimeState: taskConfig.runtimeState,
      status: null,
    });
  }
}
