/**
 * 来源导入服务模块
 * 负责执行单个 RSS URL 导入或批量 OPML 文件导入的任务逻辑。
 * 包含：创建导入运行记录、URL 验证、去重检查、来源创建以及触发首次抓取任务。
 */

import { asc, eq } from "drizzle-orm";
import { getDb, sourceImportRunItems, sourceImportRuns } from "../db";
import { type ParsedOpmlSource, parseOpml } from "../parsers";
import { buildSourceFetchDeduplicationId, getLegacyImportQueue, getQueueForTask, smartFeedTaskNames } from "../queue";
import { createLogger, sanitizeUrlForLogging } from "../utils";
import type { SourceFetchJobData } from "./content";
import {
  createSource,
  findSourceByIdentifier,
  type PreparedRssSource,
  type SourceRecord,
  verifyAndPrepareRssSource,
} from "./source";

type SourceImportRunRecord = typeof sourceImportRuns.$inferSelect;
type NewSourceImportRun = typeof sourceImportRuns.$inferInsert;
type SourceImportRunUpdate = Partial<Omit<NewSourceImportRun, "id">>;
type NewSourceImportRunItem = typeof sourceImportRunItems.$inferInsert;
type SourceImportRunItemRecord = typeof sourceImportRunItems.$inferSelect;
type SourceReference = Pick<SourceRecord, "id">;
type SourceImportRunReference = Pick<SourceImportRunRecord, "id">;
type SourceImportRunItemReference = Pick<SourceImportRunItemRecord, "id">;
const logger = createLogger("SourceImportService");
const OPML_IMPORT_CONCURRENCY = 5;

/** 来源导入任务输入数据 */
export type SourceImportJobData =
  | {
      mode: "single";
      url: string;
    }
  | {
      importRunId?: string;
      mode: "opml";
      opml: string;
    };

/** 单个条目的导入执行结果 */
export type SourceImportItemOutcome = {
  /** 原始输入的 URL */
  inputUrl: string;
  /** 规范化后的有效 URL */
  normalizedUrl: string | null;
  /** 结果类型：已创建、因重复跳过、失败 */
  result: "created" | "skipped_duplicate" | "failed";
  /** 若导入成功，关联的 sourceId */
  sourceId: string | null;
  /** 失败时的错误消息 */
  errorMessage: string | null;
};

/** 导入运行汇总统计 */
export type SourceImportSummary = {
  importRunId: string;
  mode: "single" | "opml";
  totalCount: number;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  status: "completed" | "failed";
  items: SourceImportItemOutcome[];
};

export type SourceImportRunStatus = "pending" | "running" | "completed" | "failed";

export type SourceImportRunProgress = {
  createdCount: number;
  failedCount: number;
  failedItems: Array<{
    errorMessage: string;
    inputUrl: string;
  }>;
  importRunId: string;
  processedCount: number;
  skippedCount: number;
  status: SourceImportRunStatus;
  totalCount: number;
};

/** 依赖项接口，支持 Mock */
export type SourceImportDeps = {
  clearImportRunItems?: (importRunId: string) => Promise<void>;
  createImportRun?: (data: NewSourceImportRun) => Promise<SourceImportRunReference>;
  updateImportRun?: (id: string, data: SourceImportRunUpdate) => Promise<void>;
  createImportRunItem?: (data: NewSourceImportRunItem) => Promise<SourceImportRunItemReference>;
  parseOpml?: (opml: string) => ParsedOpmlSource[];
  verifyRssSource?: (url: string) => Promise<PreparedRssSource>;
  findSourceByIdentifier?: (identifier: string) => Promise<SourceReference | null>;
  createSource?: (data: Parameters<typeof createSource>[0]) => Promise<SourceReference>;
  enqueueSourceFetch?: (data: SourceFetchJobData) => Promise<void>;
};

/** 辅助函数：确保行插入成功 */
function requireInsertedRow<T>(row: T | undefined, entityName: string): T {
  if (!row) {
    throw new Error(`[services/source-import] Failed to insert ${entityName}.`);
  }

  return row;
}

/** 创建导入运行总记录 */
async function createImportRun(data: NewSourceImportRun): Promise<SourceImportRunRecord> {
  const db = getDb();
  const [run] = await db.insert(sourceImportRuns).values(data).returning();

  return requireInsertedRow(run, "source import run");
}

/** 更新导入运行总记录（如统计数量、状态、完成时间） */
async function updateImportRun(id: string, data: SourceImportRunUpdate): Promise<void> {
  if (Object.keys(data).length === 0) {
    return;
  }

  const db = getDb();
  await db.update(sourceImportRuns).set(data).where(eq(sourceImportRuns.id, id));
}

/** 创建单条明细记录 */
async function createImportRunItem(data: NewSourceImportRunItem): Promise<SourceImportRunItemRecord> {
  const db = getDb();
  const [item] = await db.insert(sourceImportRunItems).values(data).returning();

  return requireInsertedRow(item, "source import run item");
}

async function clearImportRunItems(importRunId: string): Promise<void> {
  const db = getDb();
  await db.delete(sourceImportRunItems).where(eq(sourceImportRunItems.importRunId, importRunId));
}

/** 为新导入成功的来源入队首次抓取任务 */
async function enqueueSourceFetch(data: SourceFetchJobData): Promise<void> {
  const queue = getQueueForTask<SourceFetchJobData>(smartFeedTaskNames.sourceFetch);
  await queue.add(smartFeedTaskNames.sourceFetch, data, {
    deduplication: {
      id: buildSourceFetchDeduplicationId(data.sourceId),
    },
  });
}

function extractOpmlUrls(parsedSources: ParsedOpmlSource[]): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const source of parsedSources) {
    const trimmedUrl = source.xmlUrl.trim();

    if (!trimmedUrl || seen.has(trimmedUrl)) {
      continue;
    }

    seen.add(trimmedUrl);
    urls.push(trimmedUrl);
  }

  return urls;
}

async function enqueueSourceImport(data: SourceImportJobData): Promise<void> {
  const queue = getLegacyImportQueue<SourceImportJobData, SourceImportSummary>();
  const queueJobId =
    data.mode === "opml" && data.importRunId
      ? `source-import:${data.importRunId}`
      : `source-import:${crypto.randomUUID()}`;

  await queue.add(smartFeedTaskNames.sourceImport, data, {
    jobId: queueJobId,
  });
}

/** 格式化错误消息 */
function toFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown import error.";
}

/** 汇总执行结果统计 */
function summarizeOutcomes(outcomes: SourceImportItemOutcome[]) {
  return outcomes.reduce(
    (summary, outcome) => {
      if (outcome.result === "created") {
        summary.createdCount += 1;
      } else if (outcome.result === "skipped_duplicate") {
        summary.skippedCount += 1;
      } else {
        summary.failedCount += 1;
      }

      return summary;
    },
    {
      createdCount: 0,
      skippedCount: 0,
      failedCount: 0,
    },
  );
}

function isUniqueConstraintError(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

async function createSourceWithDeduplicationFallback(
  preparedSource: PreparedRssSource,
  deps: Required<SourceImportDeps>,
): Promise<
  | {
      result: "created";
      source: SourceReference;
    }
  | {
      result: "skipped_duplicate";
      source: SourceReference;
    }
> {
  const existingSource = await deps.findSourceByIdentifier(preparedSource.normalizedUrl);

  if (existingSource) {
    return {
      result: "skipped_duplicate",
      source: existingSource,
    };
  }

  try {
    const createdSource = await deps.createSource({
      type: "rss-source",
      identifier: preparedSource.normalizedUrl,
      title: preparedSource.title,
      siteUrl: preparedSource.siteUrl,
      status: "active",
      weight: 1,
      firstImportedAt: new Date(),
    });

    return {
      result: "created",
      source: createdSource,
    };
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const existingSourceAfterConflict = await deps.findSourceByIdentifier(preparedSource.normalizedUrl);

    if (!existingSourceAfterConflict) {
      throw error;
    }

    logger.info("Source creation hit unique constraint and was treated as duplicate", {
      normalizedUrl: sanitizeUrlForLogging(preparedSource.normalizedUrl),
      sourceId: existingSourceAfterConflict.id,
    });

    return {
      result: "skipped_duplicate",
      source: existingSourceAfterConflict,
    };
  }
}

async function mapWithConcurrencyLimit<TItem, TResult>(
  items: TItem[],
  concurrency: number,
  iteratee: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await iteratee(items[currentIndex] as TItem, currentIndex);
    }
  }

  const workerCount = Math.min(Math.max(concurrency, 1), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

/**
 * 处理单条 URL 导入的业务逻辑
 * 1. 验证 RSS URL。
 * 2. 检查数据库是否已存在该标识符。
 * 3. 若不存在，创建 source 并入队 fetch 任务。
 */
async function processSingleUrl(
  importRunId: string,
  inputUrl: string,
  deps: Required<SourceImportDeps>,
): Promise<SourceImportItemOutcome> {
  const safeInputUrlToLog = sanitizeUrlForLogging(inputUrl);
  logger.info("Processing single URL import", { inputUrl: safeInputUrlToLog, importRunId });

  try {
    const preparedSource = await deps.verifyRssSource(inputUrl);
    const safeNormalizedUrlToLog = sanitizeUrlForLogging(preparedSource.normalizedUrl);
    logger.info("URL verified and prepared", {
      inputUrl: safeInputUrlToLog,
      normalizedUrl: safeNormalizedUrlToLog,
      title: preparedSource.title,
    });

    const sourceCreation = await createSourceWithDeduplicationFallback(preparedSource, deps);

    if (sourceCreation.result === "skipped_duplicate") {
      logger.info("Source already exists, skipping creation", {
        normalizedUrl: safeNormalizedUrlToLog,
        sourceId: sourceCreation.source.id,
      });
      return {
        inputUrl,
        normalizedUrl: preparedSource.normalizedUrl,
        result: "skipped_duplicate",
        sourceId: sourceCreation.source.id,
        errorMessage: null,
      };
    }

    logger.info("Source created successfully", {
      sourceId: sourceCreation.source.id,
      identifier: safeNormalizedUrlToLog,
    });

    // 成功创建后，立即触发首次抓取
    await deps.enqueueSourceFetch({
      sourceId: sourceCreation.source.id,
      importRunId,
      trigger: "source.import",
    });

    logger.info("Initial source fetch task enqueued", { sourceId: sourceCreation.source.id });

    return {
      inputUrl,
      normalizedUrl: preparedSource.normalizedUrl,
      result: "created",
      sourceId: sourceCreation.source.id,
      errorMessage: null,
    };
  } catch (error) {
    const errorMessage = toFailureMessage(error);
    logger.warn("source import item failed", {
      error: errorMessage,
      inputUrl: safeInputUrlToLog,
      importRunId,
    });

    return {
      inputUrl,
      normalizedUrl: null,
      result: "failed",
      sourceId: null,
      errorMessage,
    };
  }
}

/** 持久化单条明细结果 */
async function persistOutcome(
  importRunId: string,
  outcome: SourceImportItemOutcome,
  deps: Required<SourceImportDeps>,
): Promise<void> {
  await deps.createImportRunItem({
    importRunId,
    inputUrl: outcome.inputUrl,
    normalizedUrl: outcome.normalizedUrl,
    result: outcome.result,
    sourceId: outcome.sourceId,
    errorMessage: outcome.errorMessage,
  });
}

/** 注入默认依赖 */
function buildDeps(overrides: SourceImportDeps): Required<SourceImportDeps> {
  return {
    clearImportRunItems: overrides.clearImportRunItems ?? clearImportRunItems,
    createImportRun: overrides.createImportRun ?? createImportRun,
    updateImportRun: overrides.updateImportRun ?? updateImportRun,
    createImportRunItem: overrides.createImportRunItem ?? createImportRunItem,
    parseOpml: overrides.parseOpml ?? parseOpml,
    verifyRssSource: overrides.verifyRssSource ?? verifyAndPrepareRssSource,
    findSourceByIdentifier: overrides.findSourceByIdentifier ?? findSourceByIdentifier,
    createSource: overrides.createSource ?? createSource,
    enqueueSourceFetch: overrides.enqueueSourceFetch ?? enqueueSourceFetch,
  };
}

/** 完成并归档运行记录 */
async function finalizeRun(
  runId: string,
  outcomes: SourceImportItemOutcome[],
  deps: Required<SourceImportDeps>,
): Promise<Pick<SourceImportSummary, "createdCount" | "skippedCount" | "failedCount" | "status">> {
  const counts = summarizeOutcomes(outcomes);
  const status: SourceImportSummary["status"] = "completed";

  await deps.updateImportRun(runId, {
    createdCount: counts.createdCount,
    skippedCount: counts.skippedCount,
    failedCount: counts.failedCount,
    status,
    finishedAt: new Date(),
  });

  return {
    ...counts,
    status,
  };
}

async function getImportRun(runId: string): Promise<SourceImportRunRecord | null> {
  const db = getDb();
  const [run] = await db.select().from(sourceImportRuns).where(eq(sourceImportRuns.id, runId));

  return run ?? null;
}

async function listImportRunItems(importRunId: string): Promise<SourceImportRunItemRecord[]> {
  const db = getDb();
  return db
    .select()
    .from(sourceImportRunItems)
    .where(eq(sourceImportRunItems.importRunId, importRunId))
    .orderBy(asc(sourceImportRunItems.createdAt), asc(sourceImportRunItems.id));
}

function toProgressSummary(
  run: Pick<SourceImportRunRecord, "id" | "status" | "totalCount" | "createdCount" | "skippedCount" | "failedCount">,
  items: SourceImportRunItemRecord[],
): SourceImportRunProgress {
  const persistedCounts = summarizeOutcomes(
    items.map((item) => ({
      inputUrl: item.inputUrl,
      normalizedUrl: item.normalizedUrl,
      result: item.result,
      sourceId: item.sourceId,
      errorMessage: item.errorMessage,
    })),
  );
  const counts =
    run.status === "pending" || run.status === "running"
      ? persistedCounts
      : {
          createdCount: run.createdCount,
          skippedCount: run.skippedCount,
          failedCount: run.failedCount,
        };

  return {
    importRunId: run.id,
    totalCount: run.totalCount,
    processedCount: items.length,
    createdCount: counts.createdCount,
    skippedCount: counts.skippedCount,
    failedCount: counts.failedCount,
    status: run.status,
    failedItems: items
      .filter((item) => item.result === "failed" && item.errorMessage)
      .map((item) => ({
        inputUrl: item.inputUrl,
        errorMessage: item.errorMessage ?? "Unknown import error.",
      })),
  };
}

export async function enqueueOpmlSourceImport(opml: string): Promise<SourceImportRunProgress> {
  const parsedSources = parseOpml(opml);
  const urls = extractOpmlUrls(parsedSources);
  const run = await createImportRun({
    mode: "opml",
    totalCount: urls.length,
    status: "pending",
  });

  try {
    await enqueueSourceImport({
      mode: "opml",
      opml,
      importRunId: run.id,
    });
  } catch (error) {
    const errorMessage = toFailureMessage(error);

    logger.error("Failed to enqueue OPML import job", {
      importRunId: run.id,
      error: errorMessage,
    });

    await updateImportRun(run.id, {
      failedCount: 1,
      finishedAt: new Date(),
      status: "failed",
    });

    throw error;
  }

  return {
    importRunId: run.id,
    totalCount: urls.length,
    processedCount: 0,
    createdCount: 0,
    skippedCount: 0,
    failedCount: 0,
    status: "pending",
    failedItems: [],
  };
}

export async function getSourceImportRunProgress(importRunId: string): Promise<SourceImportRunProgress | null> {
  const run = await getImportRun(importRunId);

  if (!run) {
    return null;
  }

  const items = await listImportRunItems(importRunId);
  return toProgressSummary(run, items);
}

/**
 * 核心导入业务入口
 * 支持 single (单条 URL) 和 opml (批量文件) 模式。
 */
export async function runSourceImport(
  input: SourceImportJobData,
  overrides: SourceImportDeps = {},
): Promise<SourceImportSummary> {
  const deps = buildDeps(overrides);
  const startedAt = new Date();

  logger.info("runSourceImport started", { mode: input.mode });

  // 模式 1: 单条导入
  if (input.mode === "single") {
    const run = await deps.createImportRun({
      mode: "single",
      totalCount: 1,
      status: "running",
      startedAt,
    });
    const outcome = await processSingleUrl(run.id, input.url, deps);

    await persistOutcome(run.id, outcome, deps);
    const counts = await finalizeRun(run.id, [outcome], deps);

    logger.info("Single URL import completed", {
      importRunId: run.id,
      result: outcome.result,
    });

    return {
      importRunId: run.id,
      mode: "single",
      totalCount: 1,
      items: [outcome],
      ...counts,
    };
  }

  // 模式 2: OPML 批量导入
  const runId = input.importRunId ?? crypto.randomUUID();

  if (input.importRunId) {
    await deps.clearImportRunItems(runId);
    await deps.updateImportRun(runId, {
      createdCount: 0,
      skippedCount: 0,
      failedCount: 0,
      finishedAt: null,
      startedAt,
      status: "running",
    });
  } else {
    await deps.createImportRun({
      id: runId,
      mode: "opml",
      totalCount: 0,
      status: "running",
      startedAt,
    });
  }

  try {
    const parsedSources = deps.parseOpml(input.opml);
    const urls = extractOpmlUrls(parsedSources);

    logger.info("OPML parsed", {
      importRunId: runId,
      urlCount: urls.length,
    });

    await deps.updateImportRun(runId, {
      totalCount: urls.length,
    });

    const outcomes = await mapWithConcurrencyLimit(urls, OPML_IMPORT_CONCURRENCY, async (url, index) => {
      logger.info(`Importing OPML item ${index + 1}/${urls.length}`, {
        url: sanitizeUrlForLogging(url),
        importRunId: runId,
      });
      const outcome = await processSingleUrl(runId, url, deps);
      await persistOutcome(runId, outcome, deps);
      return outcome;
    });

    const counts = await finalizeRun(runId, outcomes, deps);

    logger.info("OPML import completed", {
      importRunId: runId,
      ...counts,
    });

    return {
      importRunId: runId,
      mode: "opml",
      totalCount: urls.length,
      items: outcomes,
      ...counts,
    };
  } catch (error) {
    const errorMessage = toFailureMessage(error);

    logger.error("OPML import failed", {
      importRunId: runId,
      error: errorMessage,
    });

    await deps.updateImportRun(runId, {
      failedCount: 1,
      status: "failed",
      finishedAt: new Date(),
    });

    throw new Error(`[services/source-import] OPML import failed: ${errorMessage}`);
  }
}
