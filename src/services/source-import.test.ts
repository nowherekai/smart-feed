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
  const clearedRunIds: string[] = [];
  const runs: InMemoryRun[] = [];
  const updates: Array<{ id: string; data: UpdateImportRunInput }> = [];
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
  const createdSources: CreateSourceInput[] = [];

  return {
    runs,
    updates,
    clearedRunIds,
    items,
    enqueued,
    createdSources,
    deps: {
      async createImportRun(data: CreateImportRunInput) {
        const run: InMemoryRun = {
          id: data.id ?? crypto.randomUUID(),
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
      async clearImportRunItems(importRunId: string) {
        clearedRunIds.push(importRunId);

        for (let index = items.length - 1; index >= 0; index -= 1) {
          if (items[index]?.importRunId === importRunId) {
            items.splice(index, 1);
          }
        }
      },
      async updateImportRun(id: string, data: UpdateImportRunInput) {
        const run = runs.find((item) => item.id === id);

        if (!run) {
          throw new Error(`run ${id} not found`);
        }

        updates.push({
          id,
          data,
        });
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
        createdSources.push(data);

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
  expect(harness.createdSources).toHaveLength(1);
  expect(harness.createdSources[0]).toMatchObject({
    identifier: "https://example.com/feed.xml",
    title: "title:https://example.com/feed.xml",
    siteUrl: "https://site/feed.xml",
  });
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
    totalCount: 3,
    createdCount: 2,
    skippedCount: 0,
    failedCount: 1,
    status: "completed",
  });
  expect(harness.items.map((item) => item.result).sort()).toEqual(["created", "created", "failed"]);
  expect(harness.enqueued).toHaveLength(2);
});

test("runSourceImport reuses existing import run id for queued OPML jobs", async () => {
  const harness = createImportHarness();
  harness.runs.push({
    id: "existing-run",
    mode: "opml",
    totalCount: 0,
    createdCount: 0,
    skippedCount: 0,
    failedCount: 0,
    status: "pending",
  });

  const result = await runSourceImport(
    {
      mode: "opml",
      opml: "<opml />",
      importRunId: "existing-run",
    },
    harness.deps,
  );

  expect(result.importRunId).toBe("existing-run");
  expect(harness.runs).toHaveLength(1);
  expect(harness.runs[0]).toMatchObject({
    id: "existing-run",
    totalCount: 3,
    status: "completed",
  });
  expect(harness.updates[0]).toMatchObject({
    id: "existing-run",
    data: {
      createdCount: 0,
      skippedCount: 0,
      failedCount: 0,
      status: "running",
    },
  });
  expect(harness.updates[0]?.data.totalCount).toBeUndefined();
  expect(harness.clearedRunIds).toEqual(["existing-run"]);
});

test("runSourceImport treats unique constraint conflicts as skipped duplicates under concurrency", async () => {
  const harness = createImportHarness();
  const sources = new Map<string, { id: string; identifier: string }>();
  let createAttempts = 0;
  let releaseFirstCreate = () => {};
  let notifyFirstCreateStarted = () => {};
  const firstCreateStarted = new Promise<void>((resolve) => {
    notifyFirstCreateStarted = resolve;
  });

  const result = await runSourceImport(
    {
      mode: "opml",
      opml: "<opml />",
    },
    {
      ...harness.deps,
      parseOpml() {
        return [
          { text: "Upper", title: "Upper", xmlUrl: "HTTPS://EXAMPLE.COM/A.XML", htmlUrl: null },
          { text: "Lower", title: "Lower", xmlUrl: "https://example.com/a.xml", htmlUrl: null },
        ];
      },
      async verifyRssSource() {
        return {
          normalizedUrl: "https://example.com/a.xml",
          title: "title:https://example.com/a.xml",
          siteUrl: "https://site/a.xml",
        };
      },
      async findSourceByIdentifier(identifier: string) {
        return sources.get(identifier) ?? null;
      },
      async createSource(data: CreateSourceInput) {
        createAttempts += 1;

        if (createAttempts === 1) {
          notifyFirstCreateStarted();
          await new Promise<void>((resolve) => {
            releaseFirstCreate = () => {
              sources.set(data.identifier, {
                id: "source-a",
                identifier: data.identifier,
              });
              resolve();
            };
          });
        } else {
          await firstCreateStarted;
          releaseFirstCreate();
          throw {
            code: "23505",
          };
        }

        return {
          id: "source-a",
          type: "rss-source" as const,
          identifier: data.identifier,
          title: data.title ?? null,
          siteUrl: data.siteUrl ?? null,
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
    },
  );

  expect(result).toMatchObject({
    totalCount: 2,
    createdCount: 1,
    skippedCount: 1,
    failedCount: 0,
  });
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
