import { sql } from "drizzle-orm";
import type {
  StatsBucketGranularity,
  StatsFunnelStep,
  StatsPageData,
  StatsRange,
  StatsSearchParams,
  StatsTopSource,
  StatsTrendPoint,
} from "@/app/stats/types";
import { getAppEnv } from "@/config";
import { db } from "@/db";
import { createLogger } from "@/utils/logger";
import {
  addZonedDays,
  addZonedHours,
  addZonedMonths,
  getStartOfZonedDay,
  getStartOfZonedMonth,
  getStartOfZonedWeek,
  getZonedDateParts,
  zonedDateTimeToUtc,
} from "@/utils/time";

const logger = createLogger("StatsQuery");

type StatsRangeWindow = {
  range: StatsRange;
  timeZone: string;
  label: string;
  windowStart: Date | null;
  windowEnd: Date;
  bucketGranularity: StatsBucketGranularity;
};

type ContentMetricsRow = {
  totalContents: number;
  normalizedContents: number;
  analyzedContents: number;
  digestedContents: number;
  highValueContents: number;
  missingAnalyzedRecords: number;
};

type GlobalSourceMetricsRow = {
  activeSources: number;
  totalSources: number;
};

type BucketCountRow = {
  bucketKey: string;
  count: number;
};

type TopSourceRow = {
  sourceId: string;
  sourceTitle: string | null;
  sourceIdentifier: string;
  itemCount: number;
};

type StatsQueryDeps = {
  fetchContentMetrics: (window: StatsRangeWindow) => Promise<ContentMetricsRow>;
  fetchGlobalSourceMetrics: () => Promise<GlobalSourceMetricsRow>;
  fetchTrendRows: (window: StatsRangeWindow) => Promise<{
    analyzedRows: BucketCountRow[];
    contentRows: BucketCountRow[];
  }>;
  fetchTopSourceRows: (window: StatsRangeWindow) => Promise<TopSourceRow[]>;
};

export type DeduplicatedAnalysisCandidate = {
  contentId: string;
  createdAt: Date;
  status: "basic" | "full";
  valueScore: number;
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

export function normalizeStatsParams(input: StatsSearchParams): { range: StatsRange } {
  const rawRange = getFirstSearchParamValue(input.range);

  if (rawRange === "day" || rawRange === "week" || rawRange === "month" || rawRange === "all") {
    return { range: rawRange };
  }

  return { range: "week" };
}

function formatZonedDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    month: "numeric",
    day: "numeric",
  }).format(date);
}

export function getStatsRangeWindow(
  range: StatsRange,
  now = new Date(),
  timeZone = getAppEnv().timeZone,
): StatsRangeWindow {
  if (range === "day") {
    const windowStart = getStartOfZonedDay(now, timeZone);

    return {
      range,
      timeZone,
      label: `今日（${formatZonedDate(now, timeZone)}）`,
      windowStart,
      windowEnd: now,
      bucketGranularity: "hour",
    };
  }

  if (range === "month") {
    const windowStart = getStartOfZonedMonth(now, timeZone);

    return {
      range,
      timeZone,
      label: "本月",
      windowStart,
      windowEnd: now,
      bucketGranularity: "day",
    };
  }

  if (range === "all") {
    return {
      range,
      timeZone,
      label: "全部范围",
      windowStart: null,
      windowEnd: now,
      bucketGranularity: "month",
    };
  }

  const windowStart = getStartOfZonedWeek(now, timeZone);

  return {
    range,
    timeZone,
    label: "本周",
    windowStart,
    windowEnd: now,
    bucketGranularity: "day",
  };
}

function getBucketStart(date: Date, granularity: StatsBucketGranularity, timeZone: string): Date {
  if (granularity === "hour") {
    const parts = getZonedDateParts(date, timeZone);

    return zonedDateTimeToUtc(
      {
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hour: parts.hour,
        minute: 0,
        second: 0,
      },
      timeZone,
    );
  }

  if (granularity === "month") {
    return getStartOfZonedMonth(date, timeZone);
  }

  return getStartOfZonedDay(date, timeZone);
}

function shiftBucketStart(date: Date, granularity: StatsBucketGranularity, timeZone: string): Date {
  if (granularity === "hour") {
    return addZonedHours(date, 1, timeZone);
  }

  if (granularity === "month") {
    return addZonedMonths(date, 1, timeZone);
  }

  return addZonedDays(date, 1, timeZone);
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatBucketKey(date: Date, granularity: StatsBucketGranularity, timeZone: string): string {
  const parts = getZonedDateParts(date, timeZone);

  if (granularity === "hour") {
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:00`;
  }

  if (granularity === "month") {
    return `${parts.year}-${pad(parts.month)}`;
  }

  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function parseBucketKey(bucketKey: string, granularity: StatsBucketGranularity, timeZone: string): Date {
  function parseRequiredInteger(value: string | undefined, label: string): number {
    const parsed = value ? Number.parseInt(value, 10) : Number.NaN;

    if (!Number.isInteger(parsed)) {
      throw new Error(`[StatsQuery] Invalid ${granularity} bucket key "${bucketKey}" (${label}).`);
    }

    return parsed;
  }

  if (granularity === "hour") {
    const [datePart, timePart] = bucketKey.split(" ");
    const [year, month, day] = (datePart ?? "").split("-");
    const [hour] = (timePart ?? "").split(":");

    return zonedDateTimeToUtc(
      {
        year: parseRequiredInteger(year, "year"),
        month: parseRequiredInteger(month, "month"),
        day: parseRequiredInteger(day, "day"),
        hour: parseRequiredInteger(hour, "hour"),
        minute: 0,
        second: 0,
      },
      timeZone,
    );
  }

  if (granularity === "month") {
    const [year, month] = bucketKey.split("-");

    return zonedDateTimeToUtc(
      {
        year: parseRequiredInteger(year, "year"),
        month: parseRequiredInteger(month, "month"),
        day: 1,
        hour: 0,
        minute: 0,
        second: 0,
      },
      timeZone,
    );
  }

  const [year, month, day] = bucketKey.split("-");

  return zonedDateTimeToUtc(
    {
      year: parseRequiredInteger(year, "year"),
      month: parseRequiredInteger(month, "month"),
      day: parseRequiredInteger(day, "day"),
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone,
  );
}

function formatBucketLabel(date: Date, granularity: StatsBucketGranularity, timeZone: string): string {
  const parts = getZonedDateParts(date, timeZone);

  if (granularity === "hour") {
    return `${pad(parts.hour)}:00`;
  }

  if (granularity === "month") {
    return `${parts.year}/${pad(parts.month)}`;
  }

  return `${parts.month}/${parts.day}`;
}

function getBucketSqlParts(granularity: StatsBucketGranularity): { format: string; unit: "day" | "hour" | "month" } {
  if (granularity === "hour") {
    return { unit: "hour", format: "YYYY-MM-DD HH24:00" };
  }

  if (granularity === "month") {
    return { unit: "month", format: "YYYY-MM" };
  }

  return { unit: "day", format: "YYYY-MM-DD" };
}

function getContentWindowFilter(window: StatsRangeWindow) {
  if (window.windowStart) {
    return sql`effective_at >= ${window.windowStart} AND effective_at < ${window.windowEnd}`;
  }

  return sql`effective_at < ${window.windowEnd}`;
}

function getAnalysisWindowFilter(window: StatsRangeWindow) {
  if (window.windowStart) {
    return sql`created_at >= ${window.windowStart} AND created_at < ${window.windowEnd}`;
  }

  return sql`created_at < ${window.windowEnd}`;
}

function getStatsSourceDisplayName(sourceTitle: string | null, sourceIdentifier: string): string {
  const normalized = sourceTitle?.trim();
  return normalized ? normalized : sourceIdentifier;
}

function createStatsFunnelSteps(row: ContentMetricsRow): StatsFunnelStep[] {
  const counts = [
    { key: "total", label: "总文章", count: row.totalContents },
    { key: "normalized", label: "已标准化", count: row.normalizedContents },
    { key: "analyzed", label: "已分析", count: row.analyzedContents },
    { key: "digested", label: "已入 Digest", count: row.digestedContents },
  ] as const;

  return counts.map((item, index) => ({
    ...item,
    ratio: index === 0 || counts[0].count === 0 ? null : item.count / counts[0].count,
  }));
}

function toBucketCountMap(rows: BucketCountRow[]): Map<string, number> {
  return new Map(rows.map((row) => [row.bucketKey, row.count]));
}

function buildBucketStarts(
  window: StatsRangeWindow,
  contentRows: BucketCountRow[],
  analyzedRows: BucketCountRow[],
): Date[] {
  const endBucketStart = getBucketStart(window.windowEnd, window.bucketGranularity, window.timeZone);

  if (window.windowStart) {
    const bucketStarts: Date[] = [];
    let cursor = getBucketStart(window.windowStart, window.bucketGranularity, window.timeZone);

    while (cursor.getTime() <= endBucketStart.getTime()) {
      bucketStarts.push(cursor);
      cursor = shiftBucketStart(cursor, window.bucketGranularity, window.timeZone);
    }

    return bucketStarts;
  }

  const earliestBucketKey = [...contentRows, ...analyzedRows]
    .map((row) => row.bucketKey)
    .sort((left, right) => left.localeCompare(right))[0];

  if (!earliestBucketKey) {
    return [];
  }

  const bucketStarts: Date[] = [];
  let cursor = parseBucketKey(earliestBucketKey, window.bucketGranularity, window.timeZone);

  while (cursor.getTime() <= endBucketStart.getTime()) {
    bucketStarts.push(cursor);
    cursor = shiftBucketStart(cursor, window.bucketGranularity, window.timeZone);
  }

  return bucketStarts;
}

export function buildStatsTrendPoints(
  window: StatsRangeWindow,
  contentRows: BucketCountRow[],
  analyzedRows: BucketCountRow[],
): StatsTrendPoint[] {
  if (contentRows.length === 0 && analyzedRows.length === 0) {
    return [];
  }

  const contentMap = toBucketCountMap(contentRows);
  const analyzedMap = toBucketCountMap(analyzedRows);

  return buildBucketStarts(window, contentRows, analyzedRows).map((bucketStart) => {
    const bucketKey = formatBucketKey(bucketStart, window.bucketGranularity, window.timeZone);

    return {
      bucketKey,
      bucketLabel: formatBucketLabel(bucketStart, window.bucketGranularity, window.timeZone),
      contentCount: contentMap.get(bucketKey) ?? 0,
      analyzedCount: analyzedMap.get(bucketKey) ?? 0,
    };
  });
}

function selectPreferredAnalysisCandidate(
  current: DeduplicatedAnalysisCandidate | undefined,
  incoming: DeduplicatedAnalysisCandidate,
): DeduplicatedAnalysisCandidate {
  if (!current) {
    return incoming;
  }

  if (current.status !== incoming.status) {
    return incoming.status === "full" ? incoming : current;
  }

  return incoming.createdAt.getTime() >= current.createdAt.getTime() ? incoming : current;
}

export function deduplicateAnalysisCandidates(
  candidates: DeduplicatedAnalysisCandidate[],
): DeduplicatedAnalysisCandidate[] {
  const byContentId = new Map<string, DeduplicatedAnalysisCandidate>();

  for (const candidate of candidates) {
    byContentId.set(
      candidate.contentId,
      selectPreferredAnalysisCandidate(byContentId.get(candidate.contentId), candidate),
    );
  }

  return [...byContentId.values()];
}

export function countHighValueDeduplicatedAnalyses(candidates: DeduplicatedAnalysisCandidate[], threshold = 7): number {
  return deduplicateAnalysisCandidates(candidates).filter((candidate) => candidate.valueScore >= threshold).length;
}

function createStatsQueryDeps(): StatsQueryDeps {
  return {
    async fetchContentMetrics(window) {
      const result = await db.execute<{
        analyzed_contents: number | string;
        digested_contents: number | string;
        high_value_contents: number | string;
        missing_analyzed_records: number | string;
        normalized_contents: number | string;
        total_contents: number | string;
      }>(sql`
        WITH filtered_content AS (
          SELECT id, status
          FROM content_items
          WHERE ${getContentWindowFilter(window)}
        ),
        deduplicated_analysis AS (
          SELECT DISTINCT ON (content_id)
            content_id,
            value_score,
            status,
            created_at
          FROM analysis_records
          WHERE summary IS NOT NULL
          ORDER BY content_id,
            CASE WHEN status = 'full' THEN 0 ELSE 1 END,
            created_at DESC
        )
        SELECT
          COUNT(*)::int AS total_contents,
          COUNT(*) FILTER (WHERE filtered_content.status IN ('normalized', 'analyzed', 'digested'))::int AS normalized_contents,
          COUNT(*) FILTER (WHERE filtered_content.status IN ('analyzed', 'digested'))::int AS analyzed_contents,
          COUNT(*) FILTER (WHERE filtered_content.status = 'digested')::int AS digested_contents,
          COUNT(*) FILTER (
            WHERE filtered_content.status IN ('analyzed', 'digested')
              AND deduplicated_analysis.value_score >= 7
          )::int AS high_value_contents,
          COUNT(*) FILTER (
            WHERE filtered_content.status IN ('analyzed', 'digested')
              AND deduplicated_analysis.content_id IS NULL
          )::int AS missing_analyzed_records
        FROM filtered_content
        LEFT JOIN deduplicated_analysis ON deduplicated_analysis.content_id = filtered_content.id
      `);
      const row = result[0];

      return {
        totalContents: Number(row?.total_contents ?? 0),
        normalizedContents: Number(row?.normalized_contents ?? 0),
        analyzedContents: Number(row?.analyzed_contents ?? 0),
        digestedContents: Number(row?.digested_contents ?? 0),
        highValueContents: Number(row?.high_value_contents ?? 0),
        missingAnalyzedRecords: Number(row?.missing_analyzed_records ?? 0),
      };
    },
    async fetchGlobalSourceMetrics() {
      const result = await db.execute<{
        active_sources: number | string;
        total_sources: number | string;
      }>(sql`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active')::int AS active_sources,
          COUNT(*)::int AS total_sources
        FROM sources
      `);
      const row = result[0];

      return {
        activeSources: Number(row?.active_sources ?? 0),
        totalSources: Number(row?.total_sources ?? 0),
      };
    },
    async fetchTrendRows(window) {
      const { format, unit } = getBucketSqlParts(window.bucketGranularity);
      const contentRowsResult = await db.execute<{
        bucket_key: string;
        count: number | string;
      }>(sql`
        SELECT
          to_char(date_trunc(${sql.raw(`'${unit}'`)}, effective_at AT TIME ZONE ${window.timeZone}), ${format}) AS bucket_key,
          COUNT(*)::int AS count
        FROM content_items
        WHERE ${getContentWindowFilter(window)}
        GROUP BY 1
        ORDER BY 1
      `);
      const analyzedRowsResult = await db.execute<{
        bucket_key: string;
        count: number | string;
      }>(sql`
        WITH deduplicated_analysis AS (
          SELECT DISTINCT ON (content_id)
            content_id,
            created_at,
            status
          FROM analysis_records
          WHERE summary IS NOT NULL
          ORDER BY content_id,
            CASE WHEN status = 'full' THEN 0 ELSE 1 END,
            created_at DESC
        )
        SELECT
          to_char(date_trunc(${sql.raw(`'${unit}'`)}, created_at AT TIME ZONE ${window.timeZone}), ${format}) AS bucket_key,
          COUNT(*)::int AS count
        FROM deduplicated_analysis
        WHERE ${getAnalysisWindowFilter(window)}
        GROUP BY 1
        ORDER BY 1
      `);

      return {
        contentRows: Array.from(contentRowsResult).map((row) => ({
          bucketKey: row.bucket_key,
          count: Number(row.count),
        })),
        analyzedRows: Array.from(analyzedRowsResult).map((row) => ({
          bucketKey: row.bucket_key,
          count: Number(row.count),
        })),
      };
    },
    async fetchTopSourceRows(window) {
      const result = await db.execute<{
        item_count: number | string;
        source_id: string;
        source_identifier: string;
        source_title: string | null;
      }>(sql`
        SELECT
          content_items.source_id,
          sources.title AS source_title,
          sources.identifier AS source_identifier,
          COUNT(*)::int AS item_count
        FROM content_items
        INNER JOIN sources ON sources.id = content_items.source_id
        WHERE ${getContentWindowFilter(window)}
        GROUP BY content_items.source_id, sources.title, sources.identifier
        ORDER BY item_count DESC, source_identifier ASC
        LIMIT 5
      `);

      return Array.from(result).map((row) => ({
        sourceId: row.source_id,
        sourceTitle: row.source_title,
        sourceIdentifier: row.source_identifier,
        itemCount: Number(row.item_count),
      }));
    },
  };
}

export async function loadStatsPageData(
  input: StatsSearchParams,
  deps: StatsQueryDeps = createStatsQueryDeps(),
  now = new Date(),
): Promise<StatsPageData> {
  const timeZone = getAppEnv().timeZone;
  const normalized = normalizeStatsParams(input);
  const window = getStatsRangeWindow(normalized.range, now, timeZone);

  logger.info("Loading stats page data", {
    bucketGranularity: window.bucketGranularity,
    range: normalized.range,
    windowEnd: window.windowEnd.toISOString(),
    windowStart: window.windowStart?.toISOString() ?? null,
  });

  const [contentMetrics, globalSourceMetrics, trendRows, topSourceRows] = await Promise.all([
    deps.fetchContentMetrics(window),
    deps.fetchGlobalSourceMetrics(),
    deps.fetchTrendRows(window),
    deps.fetchTopSourceRows(window),
  ]);

  if (contentMetrics.missingAnalyzedRecords > 0) {
    logger.warn("Stats page found analyzed content without deduplicated analysis record", {
      missingAnalyzedRecords: contentMetrics.missingAnalyzedRecords,
      range: normalized.range,
    });
  }

  const topSources: StatsTopSource[] = topSourceRows.map((row) => ({
    sourceId: row.sourceId,
    sourceName: getStatsSourceDisplayName(row.sourceTitle, row.sourceIdentifier),
    itemCount: row.itemCount,
  }));
  const trends = buildStatsTrendPoints(window, trendRows.contentRows, trendRows.analyzedRows);
  const funnel = createStatsFunnelSteps(contentMetrics);
  const highValueRatio =
    contentMetrics.analyzedContents > 0 ? contentMetrics.highValueContents / contentMetrics.analyzedContents : null;

  logger.info("Loaded stats page data", {
    analyzedContents: contentMetrics.analyzedContents,
    topSourceCount: topSources.length,
    totalContents: contentMetrics.totalContents,
    trendPointCount: trends.length,
  });

  return {
    selectedRange: normalized.range,
    timeZone,
    rangeLabel: window.label,
    bucketGranularity: window.bucketGranularity,
    windowStart: window.windowStart,
    windowEnd: window.windowEnd,
    overview: {
      ...contentMetrics,
      activeSources: globalSourceMetrics.activeSources,
      totalSources: globalSourceMetrics.totalSources,
      highValueRatio,
    },
    funnel,
    trends,
    topSources,
  };
}
