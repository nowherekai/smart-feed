import { expect, test } from "bun:test";
import {
  getOriginalContentRangeStart,
  getOriginalContentTotalPages,
  loadOriginalContentFeed,
  normalizeOriginalContentFeedParams,
} from "../original-content/query";

test("normalizeOriginalContentFeedParams falls back to defaults for invalid search params", () => {
  expect(
    normalizeOriginalContentFeedParams({
      page: "0",
      range: "invalid",
      sourceId: "",
    }),
  ).toEqual({
    page: 1,
    range: "all",
    sourceId: null,
  });
});

test("getOriginalContentRangeStart computes Asia/Shanghai day boundaries", () => {
  const now = new Date("2026-04-02T12:30:00.000Z");

  expect(getOriginalContentRangeStart("today", now)?.toISOString()).toBe("2026-04-01T16:00:00.000Z");
  expect(getOriginalContentRangeStart("last-2-days", now)?.toISOString()).toBe("2026-03-31T16:00:00.000Z");
  expect(getOriginalContentRangeStart("last-week", now)?.toISOString()).toBe("2026-03-26T16:00:00.000Z");
  expect(getOriginalContentRangeStart("all", now)).toBeNull();
});

test("getOriginalContentTotalPages keeps at least one page", () => {
  expect(getOriginalContentTotalPages(0)).toBe(1);
  expect(getOriginalContentTotalPages(21)).toBe(1);
  expect(getOriginalContentTotalPages(101)).toBe(2);
});

test("loadOriginalContentFeed clamps page and maps preview records", async () => {
  const countCalls: Array<{ rangeStart: Date | null; sourceId: string | null }> = [];
  const fetchCalls: Array<{ rangeStart: Date | null; sourceId: string | null; limit: number; offset: number }> = [];
  const data = await loadOriginalContentFeed(
    {
      page: "9",
      range: "last-week",
      sourceId: "source-2",
    },
    {
      async countItems(filter) {
        countCalls.push(filter);
        return 125;
      },
      async fetchItems(input) {
        fetchCalls.push({
          rangeStart: input.filter.rangeStart,
          sourceId: input.filter.sourceId,
          limit: input.limit,
          offset: input.offset,
        });

        return [
          {
            id: "content-1",
            sourceId: "source-2",
            sourceIdentifier: "https://example.com/feed",
            sourceTitle: "Example",
            title: "Article Title",
            author: "Alex",
            originalUrl: "https://example.com/post",
            effectiveAt: new Date("2026-04-02T08:00:00.000Z"),
            rawBody: "<p>body only</p>",
            rawExcerpt: "<p>excerpt only</p>",
          },
        ];
      },
    },
    new Date("2026-04-02T12:30:00.000Z"),
  );

  expect(countCalls).toHaveLength(1);
  expect(countCalls[0]?.sourceId).toBe("source-2");
  expect(countCalls[0]?.rangeStart?.toISOString()).toBe("2026-03-26T16:00:00.000Z");
  expect(fetchCalls).toEqual([
    {
      rangeStart: new Date("2026-03-26T16:00:00.000Z"),
      sourceId: "source-2",
      limit: 100,
      offset: 100,
    },
  ]);
  expect(data).toEqual({
    items: [
      {
        id: "content-1",
        sourceId: "source-2",
        sourceName: "Example",
        title: "Article Title",
        author: "Alex",
        originalUrl: "https://example.com/post",
        effectiveAt: new Date("2026-04-02T08:00:00.000Z"),
        previewText: "excerpt only",
      },
    ],
    page: 2,
    pageSize: 100,
    totalItems: 125,
    totalPages: 2,
    selectedRange: "last-week",
    selectedSourceId: "source-2",
    timeZone: "Asia/Shanghai",
  });
});
