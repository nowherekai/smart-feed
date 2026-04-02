import { and, count, desc, eq, gte } from "drizzle-orm";
import type {
  OriginalContentFilterParams,
  OriginalContentFilterRange,
  OriginalContentPageData,
  OriginalContentSearchParams,
} from "@/app/original-content/types";
import { createOriginalContentPreview } from "@/components/features/original-content-preview";
import { db } from "@/db";
import { contentItemRaws, contentItems, sources } from "@/db/schema";

const ORIGINAL_CONTENT_PAGE_SIZE = 100;
const ORIGINAL_CONTENT_TIME_ZONE = "Asia/Shanghai";
const VALID_RANGES = new Set<OriginalContentFilterRange>(["all", "today", "last-2-days", "last-week"]);

type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

type OriginalContentQueryFilter = {
  rangeStart: Date | null;
  sourceId: string | null;
};

type OriginalContentQueryRow = {
  id: string;
  sourceId: string;
  sourceIdentifier: string;
  sourceTitle: string | null;
  title: string | null;
  author: string | null;
  originalUrl: string;
  effectiveAt: Date;
  rawBody: string;
  rawExcerpt: string | null;
};

type OriginalContentQueryDeps = {
  countItems: (filter: OriginalContentQueryFilter) => Promise<number>;
  fetchItems: (input: {
    filter: OriginalContentQueryFilter;
    limit: number;
    offset: number;
  }) => Promise<OriginalContentQueryRow[]>;
};

function getFirstSearchParamValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return null;
}

export function normalizeOriginalContentFeedParams(input: OriginalContentSearchParams): OriginalContentFilterParams {
  const rawRange = getFirstSearchParamValue(input.range);
  const rawSourceId = getFirstSearchParamValue(input.sourceId);
  const rawPage = getFirstSearchParamValue(input.page);
  const parsedPage = rawPage ? Number.parseInt(rawPage, 10) : Number.NaN;

  return {
    page: Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    range:
      rawRange && VALID_RANGES.has(rawRange as OriginalContentFilterRange)
        ? (rawRange as OriginalContentFilterRange)
        : "all",
    sourceId: rawSourceId?.trim() ? rawSourceId.trim() : null,
  };
}

function getZonedDateParts(date: Date, timeZone: string): ZonedDateParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const values: Partial<Record<keyof ZonedDateParts, number>> = {};

  for (const part of formatter.formatToParts(date)) {
    if (
      part.type === "year" ||
      part.type === "month" ||
      part.type === "day" ||
      part.type === "hour" ||
      part.type === "minute" ||
      part.type === "second"
    ) {
      values[part.type] = Number.parseInt(part.value, 10);
    }
  }

  return {
    year: values.year ?? 0,
    month: values.month ?? 0,
    day: values.day ?? 0,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
    second: values.second ?? 0,
  };
}

function shiftCalendarDay(parts: ZonedDateParts, deltaDays: number) {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  shifted.setUTCDate(shifted.getUTCDate() + deltaDays);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getZonedDateParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);

  return asUtc - date.getTime();
}

function zonedDateTimeToUtc(parts: ZonedDateParts, timeZone: string): Date {
  const guess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offset = getTimeZoneOffsetMs(new Date(guess), timeZone);

  return new Date(guess - offset);
}

export function getOriginalContentRangeStart(
  range: OriginalContentFilterRange,
  now = new Date(),
  timeZone = ORIGINAL_CONTENT_TIME_ZONE,
): Date | null {
  if (range === "all") {
    return null;
  }

  const today = getZonedDateParts(now, timeZone);
  const deltaDays = range === "today" ? 0 : range === "last-2-days" ? -1 : -6;
  const startDate = shiftCalendarDay(today, deltaDays);

  return zonedDateTimeToUtc(
    {
      year: startDate.year,
      month: startDate.month,
      day: startDate.day,
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone,
  );
}

export function getOriginalContentTotalPages(totalItems: number, pageSize = ORIGINAL_CONTENT_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

function clampOriginalContentPage(page: number, totalPages: number): number {
  return Math.min(Math.max(page, 1), totalPages);
}

function getOriginalContentSourceName(sourceTitle: string | null, sourceIdentifier: string): string {
  return sourceTitle?.trim() ? sourceTitle.trim() : sourceIdentifier;
}

function createOriginalContentQueryDeps(): OriginalContentQueryDeps {
  return {
    async countItems(filter) {
      const conditions = [
        filter.rangeStart ? gte(contentItems.effectiveAt, filter.rangeStart) : undefined,
        filter.sourceId ? eq(contentItems.sourceId, filter.sourceId) : undefined,
      ].filter((condition) => condition !== undefined);
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const [result] = await db
        .select({ count: count() })
        .from(contentItems)
        .innerJoin(contentItemRaws, eq(contentItemRaws.contentId, contentItems.id))
        .innerJoin(sources, eq(sources.id, contentItems.sourceId))
        .where(whereClause);

      return Number(result?.count ?? 0);
    },
    async fetchItems({ filter, limit, offset }) {
      const conditions = [
        filter.rangeStart ? gte(contentItems.effectiveAt, filter.rangeStart) : undefined,
        filter.sourceId ? eq(contentItems.sourceId, filter.sourceId) : undefined,
      ].filter((condition) => condition !== undefined);
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      return await db
        .select({
          id: contentItems.id,
          sourceId: contentItems.sourceId,
          sourceIdentifier: sources.identifier,
          sourceTitle: sources.title,
          title: contentItems.title,
          author: contentItems.author,
          originalUrl: contentItems.originalUrl,
          effectiveAt: contentItems.effectiveAt,
          rawBody: contentItemRaws.rawBody,
          rawExcerpt: contentItemRaws.rawExcerpt,
        })
        .from(contentItems)
        .innerJoin(contentItemRaws, eq(contentItemRaws.contentId, contentItems.id))
        .innerJoin(sources, eq(sources.id, contentItems.sourceId))
        .where(whereClause)
        .orderBy(desc(contentItems.effectiveAt), desc(contentItems.createdAt))
        .limit(limit)
        .offset(offset);
    },
  };
}

export async function loadOriginalContentFeed(
  input: OriginalContentSearchParams,
  deps: OriginalContentQueryDeps = createOriginalContentQueryDeps(),
  now = new Date(),
): Promise<OriginalContentPageData> {
  const normalized = normalizeOriginalContentFeedParams(input);
  const filter: OriginalContentQueryFilter = {
    rangeStart: getOriginalContentRangeStart(normalized.range, now),
    sourceId: normalized.sourceId,
  };
  const totalItems = await deps.countItems(filter);
  const totalPages = getOriginalContentTotalPages(totalItems);
  const page = clampOriginalContentPage(normalized.page, totalPages);
  const rows = await deps.fetchItems({
    filter,
    limit: ORIGINAL_CONTENT_PAGE_SIZE,
    offset: (page - 1) * ORIGINAL_CONTENT_PAGE_SIZE,
  });

  return {
    items: rows.map((row) => ({
      id: row.id,
      sourceId: row.sourceId,
      sourceName: getOriginalContentSourceName(row.sourceTitle, row.sourceIdentifier),
      title: row.title?.trim() ? row.title.trim() : row.originalUrl,
      author: row.author?.trim() ? row.author.trim() : null,
      originalUrl: row.originalUrl,
      effectiveAt: row.effectiveAt,
      previewText: createOriginalContentPreview({
        rawBody: row.rawBody,
        rawExcerpt: row.rawExcerpt,
      }),
    })),
    page,
    pageSize: ORIGINAL_CONTENT_PAGE_SIZE,
    totalItems,
    totalPages,
    selectedRange: normalized.range,
    selectedSourceId: normalized.sourceId,
  };
}
