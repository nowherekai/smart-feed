import { and, eq } from "drizzle-orm";

import { type AppEnv, getAppEnv } from "../config";
import { contentItemRaws, contentItems, getDb, sources } from "../db";
import { type ParsedRssFeed, type ParsedRssItem, parseRssFeed } from "../parsers";
import { createQueue, jobNames } from "../queue";
import { getEffectiveTime, isInTimeWindow, logger } from "../utils";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const SMART_FEED_USER_AGENT = "smart-feed/1.0 (+https://github.com/nowherekai/smart-feed)";

type SourceRecord = typeof sources.$inferSelect;
type SourceUpdate = Partial<Omit<typeof sources.$inferInsert, "id" | "identifier" | "type">>;
type ContentItemRecord = typeof contentItems.$inferSelect;
type NewContentItem = typeof contentItems.$inferInsert;
type NewContentItemRaw = typeof contentItemRaws.$inferInsert;
type ContentReference = Pick<ContentItemRecord, "id">;

export type SourceFetchJobData = {
  importRunId?: string;
  sourceId: string;
  trigger: "source.import" | "scheduler";
};

export type ContentFetchHtmlJobData = {
  contentId: string;
  trigger: "source.fetch";
};

export type SourceFetchSummary = {
  createdCount: number;
  duplicateCount: number;
  fetchedCount: number;
  queuedCount: number;
  sentinelCount: number;
  sourceId: string;
  status: "completed" | "failed";
};

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

function requireInsertedRow<T>(row: T | undefined, entityName: string): T {
  if (!row) {
    throw new Error(`[services/content] Failed to insert ${entityName}.`);
  }

  return row;
}

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
  const queue = createQueue<ContentFetchHtmlJobData>();
  await queue.add(jobNames.contentFetchHtml, data);
}

function toFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown source fetch error.";
}

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

function shouldPersistRaw(item: ParsedRssItem, inTimeWindow: boolean): boolean {
  if (inTimeWindow) {
    return true;
  }

  return item.rawBody.trim().length > 0 || item.rawExcerpt !== null;
}

function getRawContentFormat(item: ParsedRssItem): NewContentItemRaw["format"] {
  const content = item.rawBody.trim() || item.rawExcerpt?.trim() || "";

  if (/<\/?[a-z][\s\S]*>/i.test(content)) {
    return "html";
  }

  return "text";
}

function buildDeps(overrides: SourceFetchDeps): Required<SourceFetchDeps> {
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

export async function runSourceFetch(
  jobData: SourceFetchJobData,
  overrides: SourceFetchDeps = {},
): Promise<SourceFetchSummary> {
  const deps = buildDeps(overrides);
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

      const existingContent = await findExistingContent(source.id, item, deps);

      if (existingContent) {
        duplicateCount += 1;
        continue;
      }

      const inTimeWindow = isInTimeWindow(effectiveAt, deps.appEnv.timeWindowHours, deps.appEnv.timeZone, fetchedAt);
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
        status: inTimeWindow ? "raw" : "sentinel",
        title: item.title,
      });

      createdCount += 1;

      if (!inTimeWindow) {
        sentinelCount += 1;
      }

      if (shouldPersistRaw(item, inTimeWindow)) {
        await deps.createContentItemRaw({
          contentId: contentItem.id,
          format: getRawContentFormat(item),
          rawBody: item.rawBody,
          rawExcerpt: item.rawExcerpt,
          rawPayload: item.rawPayload,
        });
      }

      if (inTimeWindow) {
        await deps.enqueueContentFetchHtml({
          contentId: contentItem.id,
          trigger: "source.fetch",
        });
        queuedCount += 1;
      }
    }

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
