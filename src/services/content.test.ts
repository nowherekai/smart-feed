import { expect, test } from "bun:test";

import { runSourceFetch, type SourceFetchDeps } from "./content";

type SourceFetchSource = NonNullable<Awaited<ReturnType<NonNullable<SourceFetchDeps["getSourceById"]>>>>;
type CreateContentItemInput = Parameters<NonNullable<SourceFetchDeps["createContentItem"]>>[0];
type CreateContentItemRawInput = Parameters<NonNullable<SourceFetchDeps["createContentItemRaw"]>>[0];
type ContentFetchHtmlJobInput = Parameters<NonNullable<SourceFetchDeps["enqueueContentFetchHtml"]>>[0];
type FindContentResult = Awaited<ReturnType<NonNullable<SourceFetchDeps["findContentByExternalId"]>>>;
type ParseFeedOutput = Awaited<ReturnType<NonNullable<SourceFetchDeps["parseFeed"]>>>;
type SourceUpdateInput = Parameters<NonNullable<SourceFetchDeps["updateSource"]>>[1];

function createSourceRecord(overrides: Partial<SourceFetchSource> = {}): SourceFetchSource {
  return {
    createdAt: new Date("2026-03-30T00:00:00.000Z"),
    firstImportedAt: new Date("2026-03-30T00:00:00.000Z"),
    id: "source-1",
    identifier: "https://example.com/feed.xml",
    lastErrorAt: null,
    lastErrorMessage: null,
    lastPolledAt: null,
    lastSuccessfulSyncAt: null,
    siteUrl: null,
    status: "active",
    syncCursor: null,
    title: null,
    type: "rss-source",
    updatedAt: new Date("2026-03-30T00:00:00.000Z"),
    weight: 1,
    ...overrides,
  };
}

function createFetchHarness(sourceOverrides: Partial<SourceFetchSource> = {}) {
  const source = createSourceRecord(sourceOverrides);
  const sourceUpdates: SourceUpdateInput[] = [];
  const contentItems: CreateContentItemInput[] = [];
  const raws: CreateContentItemRawInput[] = [];
  const enqueued: ContentFetchHtmlJobInput[] = [];
  const lookupCalls: string[] = [];
  const fetchCalls: Array<{ init?: RequestInit; input: string | URL | Request }> = [];

  return {
    contentItems,
    enqueued,
    fetchCalls,
    lookupCalls,
    raws,
    source,
    sourceUpdates,
    deps: {
      appEnv: {
        timeWindowHours: 72,
        timeZone: "Asia/Shanghai",
      },
      async createContentItem(data: CreateContentItemInput) {
        contentItems.push(data);

        return {
          id: `content-${contentItems.length}`,
        };
      },
      async createContentItemRaw(data: CreateContentItemRawInput) {
        raws.push(data);
      },
      async enqueueContentFetchHtml(data: ContentFetchHtmlJobInput) {
        enqueued.push(data);
      },
      async fetchImpl(input: string | URL | Request, init?: RequestInit) {
        fetchCalls.push({ init, input });
        return new Response("<rss />", {
          headers: {
            etag: '"etag-2"',
            "last-modified": "Tue, 31 Mar 2026 08:00:00 GMT",
          },
          status: 200,
        });
      },
      async findContentByExternalId(_sourceId: string, externalId: string): Promise<FindContentResult> {
        lookupCalls.push(`external:${externalId}`);
        return null;
      },
      async findContentByNormalizedUrl(_sourceId: string, normalizedOriginalUrl: string): Promise<FindContentResult> {
        lookupCalls.push(`url:${normalizedOriginalUrl}`);
        return null;
      },
      async findContentByOriginalUrlHash(_sourceId: string, originalUrlHash: string): Promise<FindContentResult> {
        lookupCalls.push(`hash:${originalUrlHash}`);
        return null;
      },
      async getSourceById() {
        return source;
      },
      now() {
        return new Date("2026-03-31T12:00:00.000Z");
      },
      async parseFeed(): Promise<ParseFeedOutput> {
        return {
          items: [],
          siteUrl: "https://example.com",
          title: "Example Feed",
        };
      },
      async updateSource(_sourceId: string, data: SourceUpdateInput) {
        sourceUpdates.push(data);
      },
    } satisfies SourceFetchDeps,
  };
}

test("runSourceFetch sends conditional headers and updates source on 304", async () => {
  const harness = createFetchHarness({
    lastSuccessfulSyncAt: new Date("2026-03-30T10:00:00.000Z"),
    syncCursor: {
      etag: '"etag-1"',
      lastModified: "Mon, 30 Mar 2026 10:00:00 GMT",
      lastSeenExternalId: "guid-1",
      lastSeenOriginalUrl: "https://example.com/posts/1",
      lastSeenPublishedAt: "2026-03-30T10:00:00.000Z",
    },
  });

  harness.deps.fetchImpl = async (input, init) => {
    harness.fetchCalls.push({ init, input });
    return new Response(null, {
      headers: {
        etag: '"etag-2"',
      },
      status: 304,
    });
  };

  const result = await runSourceFetch(
    {
      sourceId: "source-1",
      trigger: "scheduler",
    },
    harness.deps,
  );

  expect(result).toMatchObject({
    createdCount: 0,
    duplicateCount: 0,
    fetchedCount: 0,
    queuedCount: 0,
    sentinelCount: 0,
    sourceId: "source-1",
    status: "completed",
  });
  const headers = new Headers(harness.fetchCalls[0]?.init?.headers);
  expect(headers.get("if-none-match")).toBe('"etag-1"');
  expect(headers.get("if-modified-since")).toBe("Mon, 30 Mar 2026 10:00:00 GMT");
  expect(harness.contentItems).toHaveLength(0);
  expect(harness.sourceUpdates.at(-1)).toMatchObject({
    lastErrorAt: null,
    lastErrorMessage: null,
    lastSuccessfulSyncAt: new Date("2026-03-31T12:00:00.000Z"),
    syncCursor: {
      etag: '"etag-2"',
      lastModified: "Mon, 30 Mar 2026 10:00:00 GMT",
      lastSeenExternalId: "guid-1",
      lastSeenOriginalUrl: "https://example.com/posts/1",
      lastSeenPublishedAt: "2026-03-30T10:00:00.000Z",
    },
  });
});

test("runSourceFetch writes raw content in window and sentinel content outside window", async () => {
  const harness = createFetchHarness();

  harness.deps.parseFeed = async (): Promise<ParseFeedOutput> => ({
    items: [
      {
        author: "Bob",
        externalId: "guid-old",
        fetchedAt: new Date("2026-03-31T12:00:00.000Z"),
        normalizedOriginalUrl: "https://example.com/posts/2",
        originalUrl: "https://example.com/posts/2",
        originalUrlHash: "hash-2",
        publishedAt: new Date("2026-03-20T10:00:00.000Z"),
        rawBody: "summary only",
        rawExcerpt: "summary only",
        rawPayload: { guid: "guid-old" },
        title: "Old",
      },
      {
        author: "Alice",
        externalId: "guid-in-window",
        fetchedAt: new Date("2026-03-31T12:00:00.000Z"),
        normalizedOriginalUrl: "https://example.com/posts/1",
        originalUrl: "https://example.com/posts/1",
        originalUrlHash: "hash-1",
        publishedAt: new Date("2026-03-31T10:00:00.000Z"),
        rawBody: "<p>full body</p>",
        rawExcerpt: "excerpt 1",
        rawPayload: { guid: "guid-in-window" },
        title: "In Window",
      },
      {
        author: "Carol",
        externalId: "guid-missing-url",
        fetchedAt: new Date("2026-03-31T12:00:00.000Z"),
        normalizedOriginalUrl: null,
        originalUrl: null,
        originalUrlHash: null,
        publishedAt: new Date("2026-03-31T11:00:00.000Z"),
        rawBody: "",
        rawExcerpt: null,
        rawPayload: {},
        title: "Missing Url",
      },
    ],
    siteUrl: "https://example.com",
    title: "Example Feed",
  });

  const result = await runSourceFetch(
    {
      importRunId: "run-1",
      sourceId: "source-1",
      trigger: "source.import",
    },
    harness.deps,
  );

  expect(result).toMatchObject({
    createdCount: 2,
    duplicateCount: 0,
    fetchedCount: 2,
    queuedCount: 1,
    sentinelCount: 1,
    sourceId: "source-1",
    status: "completed",
  });
  expect(harness.contentItems.map((item) => item.status)).toEqual(["sentinel", "raw"]);
  expect(harness.raws).toHaveLength(2);
  expect(harness.raws.map((item) => item.format)).toEqual(["text", "html"]);
  expect(harness.enqueued).toEqual([
    {
      contentId: "content-2",
      trigger: "source.fetch",
    },
  ]);
  expect(harness.sourceUpdates.at(-1)).toMatchObject({
    lastErrorAt: null,
    lastErrorMessage: null,
    lastSuccessfulSyncAt: new Date("2026-03-31T12:00:00.000Z"),
    siteUrl: "https://example.com",
    syncCursor: {
      lastSeenExternalId: "guid-in-window",
      lastSeenOriginalUrl: "https://example.com/posts/1",
      lastSeenPublishedAt: "2026-03-31T10:00:00.000Z",
    },
    title: "Example Feed",
  });
});

test("runSourceFetch checks duplicates in external id, normalized url, original url hash order", async () => {
  const harness = createFetchHarness();

  harness.deps.parseFeed = async (): Promise<ParseFeedOutput> => ({
    items: [
      {
        author: null,
        externalId: "guid-1",
        fetchedAt: new Date("2026-03-31T12:00:00.000Z"),
        normalizedOriginalUrl: "https://example.com/posts/1",
        originalUrl: "https://example.com/posts/1",
        originalUrlHash: "hash-1",
        publishedAt: new Date("2026-03-31T10:00:00.000Z"),
        rawBody: "<p>body</p>",
        rawExcerpt: null,
        rawPayload: {},
        title: "Duplicate",
      },
    ],
    siteUrl: null,
    title: null,
  });
  harness.deps.findContentByExternalId = async (_sourceId, externalId): Promise<FindContentResult> => {
    harness.lookupCalls.push(`external:${externalId}`);
    return {
      id: "existing-1",
    };
  };
  harness.deps.findContentByNormalizedUrl = async (_sourceId, normalizedOriginalUrl): Promise<FindContentResult> => {
    harness.lookupCalls.push(`url:${normalizedOriginalUrl}`);
    return null;
  };
  harness.deps.findContentByOriginalUrlHash = async (_sourceId, originalUrlHash): Promise<FindContentResult> => {
    harness.lookupCalls.push(`hash:${originalUrlHash}`);
    return null;
  };

  const result = await runSourceFetch(
    {
      sourceId: "source-1",
      trigger: "scheduler",
    },
    harness.deps,
  );

  expect(result).toMatchObject({
    createdCount: 0,
    duplicateCount: 1,
    fetchedCount: 1,
    queuedCount: 0,
    sentinelCount: 0,
  });
  expect(harness.lookupCalls).toEqual(["external:guid-1"]);
  expect(harness.contentItems).toHaveLength(0);
});

test("runSourceFetch skips items without effective time", async () => {
  const harness = createFetchHarness();

  harness.deps.parseFeed = async (): Promise<ParseFeedOutput> => ({
    items: [
      {
        author: null,
        externalId: null,
        fetchedAt: null as never,
        normalizedOriginalUrl: "https://example.com/posts/3",
        originalUrl: "https://example.com/posts/3",
        originalUrlHash: "hash-3",
        publishedAt: null,
        rawBody: "",
        rawExcerpt: null,
        rawPayload: {},
        title: "No Effective Time",
      },
    ],
    siteUrl: null,
    title: null,
  });

  const result = await runSourceFetch(
    {
      sourceId: "source-1",
      trigger: "scheduler",
    },
    harness.deps,
  );

  expect(result).toMatchObject({
    createdCount: 0,
    duplicateCount: 0,
    fetchedCount: 1,
    queuedCount: 0,
    sentinelCount: 0,
  });
  expect(harness.contentItems).toHaveLength(0);
});

test("runSourceFetch records failure state when request fails", async () => {
  const harness = createFetchHarness();

  harness.deps.fetchImpl = async () => {
    throw new Error("network down");
  };

  await expect(
    runSourceFetch(
      {
        sourceId: "source-1",
        trigger: "scheduler",
      },
      harness.deps,
    ),
  ).rejects.toThrow("network down");

  expect(harness.sourceUpdates.at(-1)).toMatchObject({
    lastErrorAt: new Date("2026-03-31T12:00:00.000Z"),
    lastErrorMessage: "network down",
  });
});

test("runSourceFetch skips paused or blocked sources without polling", async () => {
  const harness = createFetchHarness({
    status: "paused",
  });

  const result = await runSourceFetch(
    {
      sourceId: "source-1",
      trigger: "scheduler",
    },
    harness.deps,
  );

  expect(result).toMatchObject({
    createdCount: 0,
    duplicateCount: 0,
    fetchedCount: 0,
    queuedCount: 0,
    sentinelCount: 0,
    sourceId: "source-1",
    status: "completed",
  });
  expect(harness.fetchCalls).toHaveLength(0);
  expect(harness.sourceUpdates).toHaveLength(0);
});
