import { expect, test } from "bun:test";
import {
  buildStatsTrendPoints,
  countHighValueDeduplicatedAnalyses,
  deduplicateAnalysisCandidates,
  getStatsRangeWindow,
  loadStatsPageData,
  normalizeStatsParams,
} from "./query";

test("normalizeStatsParams falls back to week for invalid range", () => {
  expect(normalizeStatsParams({ range: "invalid" })).toEqual({ range: "week" });
  expect(normalizeStatsParams({ range: ["month", "day"] })).toEqual({ range: "month" });
});

test("getStatsRangeWindow computes Asia/Shanghai natural day week and month windows", () => {
  const now = new Date("2026-04-07T04:30:00.000Z");

  expect(getStatsRangeWindow("day", now, "Asia/Shanghai")).toMatchObject({
    bucketGranularity: "hour",
    label: "今日（4/7）",
  });
  expect(getStatsRangeWindow("day", now, "Asia/Shanghai").windowStart?.toISOString()).toBe("2026-04-06T16:00:00.000Z");
  expect(getStatsRangeWindow("week", now, "Asia/Shanghai").windowStart?.toISOString()).toBe("2026-04-05T16:00:00.000Z");
  expect(getStatsRangeWindow("month", now, "Asia/Shanghai").windowStart?.toISOString()).toBe(
    "2026-03-31T16:00:00.000Z",
  );
  expect(getStatsRangeWindow("all", now, "Asia/Shanghai").windowStart).toBeNull();
});

test("deduplicateAnalysisCandidates prefers full status and then latest createdAt", () => {
  const deduplicated = deduplicateAnalysisCandidates([
    {
      contentId: "content-1",
      createdAt: new Date("2026-04-07T02:00:00.000Z"),
      status: "basic",
      valueScore: 9,
    },
    {
      contentId: "content-1",
      createdAt: new Date("2026-04-07T01:00:00.000Z"),
      status: "full",
      valueScore: 6,
    },
    {
      contentId: "content-2",
      createdAt: new Date("2026-04-07T01:00:00.000Z"),
      status: "full",
      valueScore: 4,
    },
    {
      contentId: "content-2",
      createdAt: new Date("2026-04-07T03:00:00.000Z"),
      status: "full",
      valueScore: 8,
    },
  ]);

  expect(deduplicated).toEqual([
    {
      contentId: "content-1",
      createdAt: new Date("2026-04-07T01:00:00.000Z"),
      status: "full",
      valueScore: 6,
    },
    {
      contentId: "content-2",
      createdAt: new Date("2026-04-07T03:00:00.000Z"),
      status: "full",
      valueScore: 8,
    },
  ]);
});

test("countHighValueDeduplicatedAnalyses applies threshold after deduplication", () => {
  expect(
    countHighValueDeduplicatedAnalyses([
      {
        contentId: "content-1",
        createdAt: new Date("2026-04-07T02:00:00.000Z"),
        status: "basic",
        valueScore: 9,
      },
      {
        contentId: "content-1",
        createdAt: new Date("2026-04-07T01:00:00.000Z"),
        status: "full",
        valueScore: 6,
      },
      {
        contentId: "content-2",
        createdAt: new Date("2026-04-07T03:00:00.000Z"),
        status: "full",
        valueScore: 7,
      },
      {
        contentId: "content-3",
        createdAt: new Date("2026-04-07T04:00:00.000Z"),
        status: "basic",
        valueScore: 10,
      },
    ]),
  ).toBe(2);
});

test("buildStatsTrendPoints fills monthly buckets for all range", () => {
  const window = getStatsRangeWindow("all", new Date("2026-04-07T04:30:00.000Z"), "Asia/Shanghai");
  const points = buildStatsTrendPoints(
    window,
    [
      { bucketKey: "2026-01", count: 3 },
      { bucketKey: "2026-03", count: 5 },
    ],
    [{ bucketKey: "2026-02", count: 2 }],
  );

  expect(points).toEqual([
    { bucketKey: "2026-01", bucketLabel: "2026/01", contentCount: 3, analyzedCount: 0 },
    { bucketKey: "2026-02", bucketLabel: "2026/02", contentCount: 0, analyzedCount: 2 },
    { bucketKey: "2026-03", bucketLabel: "2026/03", contentCount: 5, analyzedCount: 0 },
    { bucketKey: "2026-04", bucketLabel: "2026/04", contentCount: 0, analyzedCount: 0 },
  ]);
});

test("loadStatsPageData handles empty dataset", async () => {
  const deps: NonNullable<Parameters<typeof loadStatsPageData>[1]> = {
    async fetchContentMetrics() {
      return {
        totalContents: 0,
        normalizedContents: 0,
        analyzedContents: 0,
        digestedContents: 0,
        highValueContents: 0,
        missingAnalyzedRecords: 0,
      };
    },
    async fetchGlobalSourceMetrics() {
      return {
        activeSources: 0,
        totalSources: 0,
      };
    },
    async fetchTrendRows() {
      return {
        contentRows: [],
        analyzedRows: [],
      };
    },
    async fetchTopSourceRows() {
      return [];
    },
  };
  const data = await loadStatsPageData({}, deps, new Date("2026-04-07T04:30:00.000Z"));

  expect(data.selectedRange).toBe("week");
  expect(data.overview.highValueRatio).toBeNull();
  expect(data.trends).toEqual([]);
  expect(data.topSources).toEqual([]);
});

test("loadStatsPageData preserves funnel monotonicity and falls back to identifier for single source", async () => {
  const deps: NonNullable<Parameters<typeof loadStatsPageData>[1]> = {
    async fetchContentMetrics() {
      return {
        totalContents: 12,
        normalizedContents: 10,
        analyzedContents: 7,
        digestedContents: 3,
        highValueContents: 4,
        missingAnalyzedRecords: 0,
      };
    },
    async fetchGlobalSourceMetrics() {
      return {
        activeSources: 1,
        totalSources: 1,
      };
    },
    async fetchTrendRows() {
      return {
        contentRows: [{ bucketKey: "2026-04-07", count: 12 }],
        analyzedRows: [{ bucketKey: "2026-04-07", count: 7 }],
      };
    },
    async fetchTopSourceRows() {
      return [
        {
          sourceId: "source-1",
          sourceTitle: "   ",
          sourceIdentifier: "https://example.com/feed.xml",
          itemCount: 12,
        },
      ];
    },
  };
  const data = await loadStatsPageData({ range: "day" }, deps, new Date("2026-04-07T04:30:00.000Z"));

  expect(data.overview.highValueRatio).toBeCloseTo(4 / 7);
  expect(data.funnel.map((step) => step.count)).toEqual([12, 10, 7, 3]);
  expect(data.topSources).toEqual([
    {
      sourceId: "source-1",
      sourceName: "https://example.com/feed.xml",
      itemCount: 12,
    },
  ]);
});
