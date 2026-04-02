/**
 * 内容核心业务服务模块
 * 负责处理从来源抓取（Source Fetch）到 HTML 提取、内容标准化（Normalization）的完整业务逻辑。
 * 包含：RSS/Atom 解析、三级去重、时间窗口过滤、全文抓取控制及流水线状态推进。
 */

import { and, eq } from "drizzle-orm";

import { type AppEnv, getAppEnv } from "../config";
import { contentItemRaws, contentItems, getDb, sources } from "../db";
import { type ParsedRssFeed, type ParsedRssItem, parseRssFeed } from "../parsers";
import { createCompletedStepResult, createFailedStepResult, type PipelineStepResult } from "../pipeline/types";
import { getQueueForTask, smartFeedTaskNames } from "../queue";
import { getEffectiveTime, isInTimeWindow, logger } from "../utils";
import { fetchPageHtml, getRawBodyExcerptCandidate } from "./html-fetcher";
import { normalizeRawContent } from "./normalizer";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const SMART_FEED_USER_AGENT = "smart-feed/1.0 (+https://github.com/nowherekai/smart-feed)";

// 类型缩写定义
type SourceRecord = typeof sources.$inferSelect;
type SourceUpdate = Partial<Omit<typeof sources.$inferInsert, "id" | "identifier" | "type">>;
type ContentItemRecord = typeof contentItems.$inferSelect;
type ContentItemUpdate = Partial<Omit<typeof contentItems.$inferInsert, "id" | "sourceId">>;
type NewContentItem = typeof contentItems.$inferInsert;
type ContentItemRawRecord = typeof contentItemRaws.$inferSelect;
type ContentItemRawUpdate = Partial<Omit<typeof contentItemRaws.$inferInsert, "id" | "contentId">>;
type NewContentItemRaw = typeof contentItemRaws.$inferInsert;
type ContentReference = Pick<ContentItemRecord, "id">;
type ContentWithRaw = {
  content: ContentItemRecord;
  raw: ContentItemRawRecord | null;
};

/** 来源抓取 Job 数据 */
export type SourceFetchJobData = {
  importRunId?: string;
  sourceId: string;
  trigger: "source.import" | "scheduler";
};

/** 全文 HTML 抓取 Job 数据 */
export type ContentFetchHtmlJobData = {
  contentId: string;
  pipelineRunId?: string;
  trigger: "source.fetch";
};

/** 内容标准化 Job 数据 */
export type ContentNormalizeJobData = {
  contentId: string;
  pipelineRunId?: string;
  trigger: "content.fetch-html";
};

export type ContentAnalysisDebugMode = "new-record" | "overwrite";

export type ContentAnalysisDebugOptions = {
  continueToHeavy?: boolean;
  recordMode: ContentAnalysisDebugMode;
  rerunKey?: string | null;
  variantTag?: string | null;
};

/** 基础分析 Job 数据 */
export type ContentAnalyzeBasicJobData = {
  contentId: string;
  debugOptions?: ContentAnalysisDebugOptions;
  pipelineRunId?: string;
  trigger: "content.normalize";
};

/** 深度摘要 Job 数据 */
export type ContentAnalyzeHeavyJobData = {
  contentId: string;
  debugOptions?: ContentAnalysisDebugOptions;
  pipelineRunId?: string;
  trigger: "content.analyze.basic";
};

/** 来源抓取执行汇总结果 */
export type SourceFetchSummary = {
  /** 成功创建并入库的文章数 */
  createdCount: number;
  /** 因重复而被过滤的文章数 */
  duplicateCount: number;
  /** 从 Feed 中解析出的文章总数 */
  fetchedCount: number;
  /** 成功入队到后续流水线的文章数 */
  queuedCount: number;
  /** 因超出时间窗口仅记录为哨兵的文章数 */
  sentinelCount: number;
  sourceId: string;
  status: "completed" | "failed";
};

/** HTML 抓取步骤产出的业务载荷 */
export type ContentFetchHtmlPayload = {
  contentId: string;
  /** 是否成功执行了网络抓取 */
  fetched: boolean;
  /** 是否回退使用了 RSS 原始内容 */
  usedFallback: boolean;
};

/** 标准化步骤产出的业务载荷 */
export type ContentNormalizePayload = {
  contentId: string;
  /** 生成的 Markdown 字节大小 */
  markdownBytes: number;
  /** 是否因长度限制被截断 */
  truncated: boolean;
};

// 依赖项定义，支持依赖注入测试
export type SourceFetchDeps = {
  appEnv?: Pick<AppEnv, "timeWindowHours" | "timeZone">;
  createContentItem?: (data: NewContentItem) => Promise<ContentReference>;
  createContentItemRaw?: (data: NewContentItemRaw) => Promise<void>;
  enqueueContentFetchHtml?: (data: ContentFetchHtmlJobData) => Promise<void>;
  fetchImpl?: FetchLike;
  findContentByExternalId?: (sourceId: string, externalId: string) => Promise<ContentReference | null>;
  findContentByNormalizedUrl?: (sourceId: string, normalizedOriginalUrl: string) => Promise<ContentReference | null>;
  findContentByOriginalUrlHash?: (sourceId: string, originalUrlHash: string) => Promise<ContentReference | null>;
  getSourceById?: (sourceId: string) => Promise<SourceRecord | null>;
  now?: () => Date;
  parseFeed?: (input: { fetchedAt: Date; feedUrl: string; xml: string }) => Promise<ParsedRssFeed>;
  updateSource?: (sourceId: string, data: SourceUpdate) => Promise<void>;
};

export type ContentFetchHtmlDeps = {
  fetchHtml?: (url: string) => Promise<string>;
  getContentWithRawById?: (contentId: string) => Promise<ContentWithRaw | null>;
  updateContentItem?: (contentId: string, data: ContentItemUpdate) => Promise<void>;
  updateContentItemRaw?: (contentId: string, data: ContentItemRawUpdate) => Promise<void>;
};

export type ContentNormalizeDeps = {
  getContentWithRawById?: (contentId: string) => Promise<ContentWithRaw | null>;
  normalizeContent?: typeof normalizeRawContent;
  updateContentItem?: (contentId: string, data: ContentItemUpdate) => Promise<void>;
};

function requireInsertedRow<T>(row: T | undefined, entityName: string): T {
  if (!row) {
    throw new Error(`[services/content] Failed to insert ${entityName}.`);
  }

  return row;
}

// --- 数据库操作辅助函数 ---

async function getSourceById(sourceId: string): Promise<SourceRecord | null> {
  const db = getDb();
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId));

  return source ?? null;
}

async function updateSource(sourceId: string, data: SourceUpdate): Promise<void> {
  if (Object.keys(data).length === 0) {
    return;
  }

  const db = getDb();
  await db.update(sources).set(data).where(eq(sources.id, sourceId));
}

async function getContentWithRawById(contentId: string): Promise<ContentWithRaw | null> {
  const db = getDb();
  const [result] = await db
    .select({
      content: contentItems,
      raw: contentItemRaws,
    })
    .from(contentItems)
    .leftJoin(contentItemRaws, eq(contentItemRaws.contentId, contentItems.id))
    .where(eq(contentItems.id, contentId));

  if (!result) {
    return null;
  }

  return {
    content: result.content,
    raw: result.raw,
  };
}

async function updateContentItem(contentId: string, data: ContentItemUpdate): Promise<void> {
  if (Object.keys(data).length === 0) {
    return;
  }

  const db = getDb();
  await db.update(contentItems).set(data).where(eq(contentItems.id, contentId));
}

async function updateContentItemRaw(contentId: string, data: ContentItemRawUpdate): Promise<void> {
  if (Object.keys(data).length === 0) {
    return;
  }

  const db = getDb();
  await db.update(contentItemRaws).set(data).where(eq(contentItemRaws.contentId, contentId));
}

async function findContentByExternalId(sourceId: string, externalId: string): Promise<ContentReference | null> {
  const db = getDb();
  const [content] = await db
    .select({ id: contentItems.id })
    .from(contentItems)
    .where(and(eq(contentItems.sourceId, sourceId), eq(contentItems.externalId, externalId)));

  return content ?? null;
}

async function findContentByNormalizedUrl(
  sourceId: string,
  normalizedOriginalUrl: string,
): Promise<ContentReference | null> {
  const db = getDb();
  const [content] = await db
    .select({ id: contentItems.id })
    .from(contentItems)
    .where(and(eq(contentItems.sourceId, sourceId), eq(contentItems.normalizedOriginalUrl, normalizedOriginalUrl)));

  return content ?? null;
}

async function findContentByOriginalUrlHash(
  sourceId: string,
  originalUrlHash: string,
): Promise<ContentReference | null> {
  const db = getDb();
  const [content] = await db
    .select({ id: contentItems.id })
    .from(contentItems)
    .where(and(eq(contentItems.sourceId, sourceId), eq(contentItems.originalUrlHash, originalUrlHash)));

  return content ?? null;
}

async function createContentItem(data: NewContentItem): Promise<ContentReference> {
  const db = getDb();
  const [contentItem] = await db.insert(contentItems).values(data).returning({ id: contentItems.id });

  return requireInsertedRow(contentItem, "content item");
}

async function createContentItemRaw(data: NewContentItemRaw): Promise<void> {
  const db = getDb();
  await db.insert(contentItemRaws).values(data);
}

async function enqueueContentFetchHtml(data: ContentFetchHtmlJobData): Promise<void> {
  const queue = getQueueForTask<ContentFetchHtmlJobData>(smartFeedTaskNames.contentFetchHtml);
  await queue.add(smartFeedTaskNames.contentFetchHtml, data);
}

function toFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown source fetch error.";
}

/**
 * 构建抓取请求头，包含 ETag 和 Last-Modified 支持
 */
function buildRequestHeaders(source: SourceRecord): HeadersInit {
  const headers: Record<string, string> = {
    accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
    "user-agent": SMART_FEED_USER_AGENT,
  };

  if (source.syncCursor?.etag) {
    headers["if-none-match"] = source.syncCursor.etag;
  }

  if (source.syncCursor?.lastModified) {
    headers["if-modified-since"] = source.syncCursor.lastModified;
  }

  return headers;
}

/**
 * 从解析出的文章列表中找出“最新”的一篇（基于业务时间）
 */
function getLatestSeenItem(items: ParsedRssItem[]): ParsedRssItem | undefined {
  let latestSeenItem: ParsedRssItem | undefined;
  let latestSeenTimestamp = Number.NEGATIVE_INFINITY;

  for (const item of items) {
    if (!item.originalUrl || !item.normalizedOriginalUrl || !item.originalUrlHash) {
      continue;
    }

    const effectiveTime = getEffectiveTime(item.publishedAt, item.fetchedAt);
    const effectiveTimestamp = effectiveTime?.getTime() ?? Number.NEGATIVE_INFINITY;

    if (!latestSeenItem || effectiveTimestamp > latestSeenTimestamp) {
      latestSeenItem = item;
      latestSeenTimestamp = effectiveTimestamp;
    }
  }

  return latestSeenItem;
}

/**
 * 三级去重逻辑
 * 1. 优先使用 externalId (RSS GUID)。
 * 2. 其次使用规范化后的原始 URL。
 * 3. 最后使用原始 URL 哈希值作为回退。
 */
async function findExistingContent(
  sourceId: string,
  item: ParsedRssItem,
  deps: Required<SourceFetchDeps>,
): Promise<ContentReference | null> {
  if (item.externalId) {
    const existingByExternalId = await deps.findContentByExternalId(sourceId, item.externalId);

    if (existingByExternalId) {
      return existingByExternalId;
    }
  }

  if (item.normalizedOriginalUrl) {
    const existingByUrl = await deps.findContentByNormalizedUrl(sourceId, item.normalizedOriginalUrl);

    if (existingByUrl) {
      return existingByUrl;
    }
  }

  if (item.originalUrlHash) {
    const existingByHash = await deps.findContentByOriginalUrlHash(sourceId, item.originalUrlHash);

    if (existingByHash) {
      return existingByHash;
    }
  }

  return null;
}

/**
 * 构建更新后的同步游标
 */
function buildNextSyncCursor(
  source: SourceRecord,
  items: ParsedRssItem[],
  headers: Headers,
): SourceRecord["syncCursor"] {
  const latestSeenItem = getLatestSeenItem(items);

  return {
    etag: headers.get("etag") ?? source.syncCursor?.etag ?? null,
    lastModified: headers.get("last-modified") ?? source.syncCursor?.lastModified ?? null,
    lastSeenExternalId: latestSeenItem?.externalId ?? source.syncCursor?.lastSeenExternalId ?? null,
    lastSeenOriginalUrl: latestSeenItem?.originalUrl ?? source.syncCursor?.lastSeenOriginalUrl ?? null,
    lastSeenPublishedAt: latestSeenItem?.publishedAt?.toISOString() ?? source.syncCursor?.lastSeenPublishedAt ?? null,
  };
}

/**
 * 判断是否需要持久化原始内容
 * 时间窗口内的内容或有实质内容的哨兵需要持久化。
 */
function shouldPersistRaw(item: ParsedRssItem, inTimeWindow: boolean): boolean {
  if (inTimeWindow) {
    return true;
  }

  return item.rawBody.trim().length > 0 || item.rawExcerpt !== null;
}

/**
 * 自动识别原始内容格式
 */
function getRawContentFormat(item: ParsedRssItem): NewContentItemRaw["format"] {
  const content = item.rawBody.trim() || item.rawExcerpt?.trim() || "";

  if (/<\/?[a-z][\s\S]*>/i.test(content)) {
    return "html";
  }

  return "text";
}

// --- 依赖构建辅助函数 ---

function buildSourceFetchDeps(overrides: SourceFetchDeps): Required<SourceFetchDeps> {
  return {
    appEnv: overrides.appEnv ?? getAppEnv(),
    createContentItem: overrides.createContentItem ?? createContentItem,
    createContentItemRaw: overrides.createContentItemRaw ?? createContentItemRaw,
    enqueueContentFetchHtml: overrides.enqueueContentFetchHtml ?? enqueueContentFetchHtml,
    fetchImpl: overrides.fetchImpl ?? fetch,
    findContentByExternalId: overrides.findContentByExternalId ?? findContentByExternalId,
    findContentByNormalizedUrl: overrides.findContentByNormalizedUrl ?? findContentByNormalizedUrl,
    findContentByOriginalUrlHash: overrides.findContentByOriginalUrlHash ?? findContentByOriginalUrlHash,
    getSourceById: overrides.getSourceById ?? getSourceById,
    now: overrides.now ?? (() => new Date()),
    parseFeed: overrides.parseFeed ?? parseRssFeed,
    updateSource: overrides.updateSource ?? updateSource,
  };
}

function buildContentFetchHtmlDeps(overrides: ContentFetchHtmlDeps): Required<ContentFetchHtmlDeps> {
  return {
    fetchHtml: overrides.fetchHtml ?? fetchPageHtml,
    getContentWithRawById: overrides.getContentWithRawById ?? getContentWithRawById,
    updateContentItem: overrides.updateContentItem ?? updateContentItem,
    updateContentItemRaw: overrides.updateContentItemRaw ?? updateContentItemRaw,
  };
}

function buildContentNormalizeDeps(overrides: ContentNormalizeDeps): Required<ContentNormalizeDeps> {
  return {
    getContentWithRawById: overrides.getContentWithRawById ?? getContentWithRawById,
    normalizeContent: overrides.normalizeContent ?? normalizeRawContent,
    updateContentItem: overrides.updateContentItem ?? updateContentItem,
  };
}

/**
 * 来源抓取核心业务逻辑
 * 1. 获取并校验来源状态。
 * 2. 抓取 Feed XML (支持 304 Not Modified)。
 * 3. 解析 Feed 得到文章列表。
 * 4. 遍历文章：
 *    - 执行三级去重。
 *    - 判断是否在时间窗口内。
 *    - 创建 ContentItem 记录。
 *    - 根据状态 (inTimeWindow) 决定标记为 raw 或 sentinel。
 *    - 持久化原始内容 (content_item_raws)。
 *    - 只有 raw 状态的文章才会入队下一步：全文 HTML 抓取。
 * 5. 更新 Source 同步状态和游标。
 */
export async function runSourceFetch(
  jobData: SourceFetchJobData,
  overrides: SourceFetchDeps = {},
): Promise<SourceFetchSummary> {
  const deps = buildSourceFetchDeps(overrides);
  const fetchedAt = deps.now();
  const source = await deps.getSourceById(jobData.sourceId);

  if (!source) {
    throw new Error(`[services/content] Source "${jobData.sourceId}" not found.`);
  }

  if (source.status !== "active") {
    logger.info("source fetch skipped because source is not active", {
      sourceId: source.id,
      sourceStatus: source.status,
      trigger: jobData.trigger,
    });

    return {
      createdCount: 0,
      duplicateCount: 0,
      fetchedCount: 0,
      queuedCount: 0,
      sentinelCount: 0,
      sourceId: source.id,
      status: "completed",
    };
  }

  await deps.updateSource(source.id, {
    lastPolledAt: fetchedAt,
  });

  try {
    const response = await deps.fetchImpl(source.identifier, {
      headers: buildRequestHeaders(source),
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });

    // 处理 304 缓存逻辑
    if (response.status === 304) {
      await deps.updateSource(source.id, {
        lastErrorAt: null,
        lastErrorMessage: null,
        lastSuccessfulSyncAt: fetchedAt,
        syncCursor: buildNextSyncCursor(source, [], response.headers),
      });

      return {
        createdCount: 0,
        duplicateCount: 0,
        fetchedCount: 0,
        queuedCount: 0,
        sentinelCount: 0,
        sourceId: source.id,
        status: "completed",
      };
    }

    if (!response.ok) {
      throw new Error(`[services/content] Source fetch returned ${response.status}.`);
    }

    const xml = await response.text();

    if (!xml.trim()) {
      throw new Error("[services/content] Source fetch returned an empty response.");
    }

    const parsedFeed = await deps.parseFeed({
      fetchedAt,
      feedUrl: source.identifier,
      xml,
    });

    let createdCount = 0;
    let duplicateCount = 0;
    let fetchedCount = 0;
    let queuedCount = 0;
    let sentinelCount = 0;

    for (const item of parsedFeed.items) {
      if (!item.originalUrl || !item.normalizedOriginalUrl || !item.originalUrlHash) {
        continue;
      }

      fetchedCount += 1;

      const effectiveAt = getEffectiveTime(item.publishedAt, item.fetchedAt);

      if (!effectiveAt) {
        continue;
      }

      // 1. 去重检查
      const existingContent = await findExistingContent(source.id, item, deps);

      if (existingContent) {
        duplicateCount += 1;
        continue;
      }

      // 2. 时间窗口判定
      const inTimeWindow = isInTimeWindow(effectiveAt, deps.appEnv.timeWindowHours, deps.appEnv.timeZone, fetchedAt);

      // 3. 创建内容基础记录
      const contentItem = await deps.createContentItem({
        author: item.author,
        effectiveAt,
        externalId: item.externalId,
        fetchedAt: item.fetchedAt,
        normalizedOriginalUrl: item.normalizedOriginalUrl,
        originalUrl: item.originalUrl,
        originalUrlHash: item.originalUrlHash,
        publishedAt: item.publishedAt,
        sourceId: source.id,
        // 若超出窗口，标记为 sentinel（仅存哨兵，不流水线处理）
        status: inTimeWindow ? "raw" : "sentinel",
        title: item.title,
      });

      createdCount += 1;

      if (!inTimeWindow) {
        sentinelCount += 1;
      }

      // 4. 存储原始内容负载
      if (shouldPersistRaw(item, inTimeWindow)) {
        await deps.createContentItemRaw({
          contentId: contentItem.id,
          format: getRawContentFormat(item),
          rawBody: item.rawBody,
          rawExcerpt: item.rawExcerpt,
          rawPayload: item.rawPayload,
        });
      }

      // 5. 若在窗口内，入队下一步处理器
      if (inTimeWindow) {
        await deps.enqueueContentFetchHtml({
          contentId: contentItem.id,
          trigger: "source.fetch",
        });
        queuedCount += 1;
      }
    }

    // 6. 更新来源同步元数据
    await deps.updateSource(source.id, {
      lastErrorAt: null,
      lastErrorMessage: null,
      lastSuccessfulSyncAt: fetchedAt,
      siteUrl: parsedFeed.siteUrl ?? source.siteUrl,
      syncCursor: buildNextSyncCursor(source, parsedFeed.items, response.headers),
      title: parsedFeed.title ?? source.title,
    });

    return {
      createdCount,
      duplicateCount,
      fetchedCount,
      queuedCount,
      sentinelCount,
      sourceId: source.id,
      status: "completed",
    };
  } catch (error) {
    const errorMessage = toFailureMessage(error);

    await deps.updateSource(source.id, {
      lastErrorAt: fetchedAt,
      lastErrorMessage: errorMessage,
    });
    logger.error("source fetch failed", {
      error: errorMessage,
      sourceId: source.id,
      trigger: jobData.trigger,
    });

    throw error;
  }
}

/**
 * 全文 HTML 抓取业务逻辑
 * 无论 RSS 是否提供全文，都优先尝试抓取原始页面以获取最新、最全、格式最整洁的内容。
 * 若抓取成功，更新 raw_body。
 * 若抓取失败，且 RSS 已有原始内容，则通过“completed_with_fallback”降级完成并继续流水线。
 */
export async function runContentFetchHtml(
  jobData: ContentFetchHtmlJobData,
  overrides: ContentFetchHtmlDeps = {},
): Promise<PipelineStepResult<ContentFetchHtmlPayload, ContentNormalizeJobData>> {
  const deps = buildContentFetchHtmlDeps(overrides);
  const record = await deps.getContentWithRawById(jobData.contentId);

  if (!record) {
    return createFailedStepResult({
      message: `[services/content] Content "${jobData.contentId}" not found.`,
      payload: {
        contentId: jobData.contentId,
        fetched: false,
        usedFallback: false,
      },
    });
  }

  if (!record.raw) {
    const message = `[services/content] Raw content for "${jobData.contentId}" not found.`;

    await deps.updateContentItem(record.content.id, {
      processingError: message,
      status: "failed",
    });

    return createFailedStepResult({
      message,
      payload: {
        contentId: record.content.id,
        fetched: false,
        usedFallback: false,
      },
    });
  }

  let fetched = false;
  let usedFallback = false;

  try {
    // 尝试抓取全文
    const fetchedHtml = await deps.fetchHtml(record.content.originalUrl);

    // 更新内容，将原有内容作为摘要备选
    await deps.updateContentItemRaw(record.content.id, {
      format: "html",
      rawBody: fetchedHtml,
      rawExcerpt: record.raw.rawExcerpt ?? getRawBodyExcerptCandidate(record.raw.rawBody),
    });
    fetched = true;

    await deps.updateContentItem(record.content.id, {
      processingError: null,
      status: "raw",
    });
  } catch (error) {
    const errorMessage = toFailureMessage(error);
    const fallbackAvailable = Boolean(record.raw.rawBody.trim() || record.raw.rawExcerpt?.trim());

    // 抓取失败且没有 RSS 原始内容，则流水线失败
    if (!fallbackAvailable) {
      await deps.updateContentItem(record.content.id, {
        processingError: errorMessage,
        status: "failed",
      });

      return createFailedStepResult({
        message: errorMessage,
        payload: {
          contentId: record.content.id,
          fetched: false,
          usedFallback: false,
        },
      });
    }

    // 抓取失败但有 RSS 原始内容，标记为使用降级方案，允许继续
    usedFallback = true;
    await deps.updateContentItem(record.content.id, {
      processingError: errorMessage,
      status: "raw",
    });
    logger.warn("content html fetch failed, fallback to existing raw body", {
      contentId: record.content.id,
      error: errorMessage,
      originalUrl: record.content.originalUrl,
      trigger: jobData.trigger,
    });
  }

  return createCompletedStepResult({
    message: usedFallback ? "content.fetch-html completed with RSS fallback" : null,
    nextStep: {
      data: {
        contentId: record.content.id,
        trigger: "content.fetch-html",
      },
      jobName: smartFeedTaskNames.contentNormalize,
    },
    outcome: usedFallback ? "completed_with_fallback" : "completed",
    payload: {
      contentId: record.content.id,
      fetched,
      usedFallback,
    },
  });
}

/**
 * 内容标准化业务逻辑
 * 将 HTML 转换为 Markdown，并存储到 cleaned_md 字段。
 * 转换后，将状态推进至 normalized。
 */
export async function runContentNormalize(
  jobData: ContentNormalizeJobData,
  overrides: ContentNormalizeDeps = {},
): Promise<PipelineStepResult<ContentNormalizePayload, ContentAnalyzeBasicJobData>> {
  logger.info("runContentNormalize started", {
    contentId: jobData.contentId,
    pipelineRunId: jobData.pipelineRunId,
    trigger: jobData.trigger,
  });

  const deps = buildContentNormalizeDeps(overrides);
  const record = await deps.getContentWithRawById(jobData.contentId);

  if (!record) {
    return createFailedStepResult({
      message: `[services/content] Content "${jobData.contentId}" not found.`,
      payload: {
        contentId: jobData.contentId,
        markdownBytes: 0,
        truncated: false,
      },
    });
  }

  if (!record.raw) {
    const message = `[services/content] Raw content for "${jobData.contentId}" not found.`;

    await deps.updateContentItem(record.content.id, {
      processingError: message,
      status: "failed",
    });

    return createFailedStepResult({
      message,
      payload: {
        contentId: record.content.id,
        markdownBytes: 0,
        truncated: false,
      },
    });
  }

  try {
    // 调用转换工具：HTML -> Markdown (包含清洗噪音逻辑)
    const normalized = deps.normalizeContent({
      format: record.raw.format,
      originalUrl: record.content.originalUrl,
      rawBody: record.raw.rawBody,
      title: record.content.title,
    });
    const markdownBytes = new TextEncoder().encode(normalized.markdown).length;

    await deps.updateContentItem(record.content.id, {
      cleanedMd: normalized.markdown,
      processingError: null,
      status: "normalized",
    });

    return createCompletedStepResult({
      nextStep: {
        data: {
          contentId: record.content.id,
          trigger: "content.normalize",
        },
        jobName: smartFeedTaskNames.contentAnalyzeBasic,
      },
      payload: {
        contentId: record.content.id,
        markdownBytes,
        truncated: normalized.truncated,
      },
    });
  } catch (error) {
    const errorMessage = toFailureMessage(error);

    await deps.updateContentItem(record.content.id, {
      processingError: errorMessage,
      status: "failed",
    });

    return createFailedStepResult({
      message: errorMessage,
      payload: {
        contentId: record.content.id,
        markdownBytes: 0,
        truncated: false,
      },
    });
  }
}
