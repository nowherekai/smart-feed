import { expect, test } from "bun:test";

import { runSourceImport, type SourceImportDeps } from "./source-import";

type InMemoryRun = {
  id: string;
  mode: "single" | "opml";
  totalCount: number;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  status: "pending" | "running" | "completed" | "failed";
};

type CreateImportRunInput = Parameters<NonNullable<SourceImportDeps["createImportRun"]>>[0];
type UpdateImportRunInput = Parameters<NonNullable<SourceImportDeps["updateImportRun"]>>[1];
type CreateImportRunItemInput = Parameters<NonNullable<SourceImportDeps["createImportRunItem"]>>[0];
type CreateSourceInput = Parameters<NonNullable<SourceImportDeps["createSource"]>>[0];
type EnqueueSourceFetchInput = Parameters<NonNullable<SourceImportDeps["enqueueSourceFetch"]>>[0];

function createImportHarness() {
  const runs: InMemoryRun[] = [];
  const items: Array<{
    importRunId: string;
    inputUrl: string;
    normalizedUrl: string | null;
    result: "created" | "skipped_duplicate" | "failed";
    sourceId: string | null;
    errorMessage: string | null;
  }> = [];
  const enqueued: Array<{ importRunId?: string; sourceId: string; trigger: "source.import" | "scheduler" }> = [];
  const sources = new Map<string, { id: string; identifier: string }>();

  return {
    runs,
    items,
    enqueued,
    deps: {
      async createImportRun(data: CreateImportRunInput) {
        const run: InMemoryRun = {
          id: crypto.randomUUID(),
          mode: data.mode,
          totalCount: data.totalCount ?? 0,
          createdCount: 0,
          skippedCount: 0,
          failedCount: 0,
          status: data.status ?? "pending",
        };

        runs.push(run);

        return {
          ...run,
          startedAt: data.startedAt ?? null,
          finishedAt: null,
          createdAt: new Date(),
        };
      },
      async updateImportRun(id: string, data: UpdateImportRunInput) {
        const run = runs.find((item) => item.id === id);

        if (!run) {
          throw new Error(`run ${id} not found`);
        }

        Object.assign(run, data);
      },
      async createImportRunItem(data: CreateImportRunItemInput) {
        items.push({
          importRunId: data.importRunId,
          inputUrl: data.inputUrl,
          normalizedUrl: data.normalizedUrl ?? null,
          result: data.result,
          sourceId: data.sourceId ?? null,
          errorMessage: data.errorMessage ?? null,
        });

        return {
          id: crypto.randomUUID(),
          createdAt: new Date(),
        };
      },
      parseOpml(opml: string) {
        if (opml === "broken") {
          throw new Error("bad xml");
        }

        return [
          { text: "A", title: "A", xmlUrl: "https://example.com/a.xml", htmlUrl: null },
          { text: "A copy", title: "A copy", xmlUrl: "https://example.com/a.xml", htmlUrl: null },
          { text: "B", title: "B", xmlUrl: "https://example.com/b.xml", htmlUrl: null },
          { text: "Bad", title: "Bad", xmlUrl: "https://example.com/bad.xml", htmlUrl: null },
        ];
      },
      async verifyRssSource(url: string) {
        if (url.includes("bad")) {
          throw new Error("unreachable");
        }

        return {
          normalizedUrl: url.toLowerCase(),
          title: `title:${url}`,
          siteUrl: `https://site/${url.split("/").at(-1) ?? "feed"}`,
        };
      },
      async findSourceByIdentifier(identifier: string) {
        return sources.get(identifier) ?? null;
      },
      async createSource(data: CreateSourceInput) {
        const source = {
          id: crypto.randomUUID(),
          identifier: data.identifier,
        };

        sources.set(data.identifier, source);

        return {
          ...source,
          type: "rss-source" as const,
          title: null,
          siteUrl: null,
          status: "active" as const,
          weight: 1,
          syncCursor: null,
          firstImportedAt: new Date(),
          lastPolledAt: null,
          lastSuccessfulSyncAt: null,
          lastErrorAt: null,
          lastErrorMessage: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
      async enqueueSourceFetch(data: EnqueueSourceFetchInput) {
        enqueued.push(data);
      },
    } satisfies SourceImportDeps,
  };
}

test("runSourceImport creates a single RSS source and enqueues first fetch", async () => {
  const harness = createImportHarness();

  const result = await runSourceImport(
    {
      mode: "single",
      url: "https://example.com/feed.xml",
    },
    harness.deps,
  );

  expect(result).toMatchObject({
    mode: "single",
    totalCount: 1,
    createdCount: 1,
    skippedCount: 0,
    failedCount: 0,
    status: "completed",
  });
  expect(harness.items).toHaveLength(1);
  expect(harness.items[0]?.result).toBe("created");
  expect(harness.enqueued).toHaveLength(1);
});

test("runSourceImport marks duplicate and failed items during OPML batch import", async () => {
  const harness = createImportHarness();

  const result = await runSourceImport(
    {
      mode: "opml",
      opml: "<opml />",
    },
    harness.deps,
  );

  expect(result).toMatchObject({
    mode: "opml",
    totalCount: 4,
    createdCount: 2,
    skippedCount: 1,
    failedCount: 1,
    status: "completed",
  });
  expect(harness.items.map((item) => item.result)).toEqual(["created", "skipped_duplicate", "created", "failed"]);
  expect(harness.enqueued).toHaveLength(2);
});

test("runSourceImport marks OPML run as failed when parsing throws", async () => {
  const harness = createImportHarness();

  await expect(
    runSourceImport(
      {
        mode: "opml",
        opml: "broken",
      },
      harness.deps,
    ),
  ).rejects.toThrow("OPML import failed");

  expect(harness.runs).toHaveLength(1);
  expect(harness.runs[0]?.status).toBe("failed");
});
