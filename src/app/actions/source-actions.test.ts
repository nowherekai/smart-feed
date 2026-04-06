import { afterEach, expect, mock, test } from "bun:test";

afterEach(() => {
  mock.restore();
});

function createSingleImportResult(
  outcome:
    | {
        result: "created" | "skipped_duplicate";
        normalizedUrl: string;
        sourceId: string;
      }
    | {
        result: "failed";
        errorMessage: string;
      },
) {
  return {
    importRunId: "import-run-1",
    mode: "single" as const,
    totalCount: 1,
    createdCount: outcome.result === "created" ? 1 : 0,
    skippedCount: outcome.result === "skipped_duplicate" ? 1 : 0,
    failedCount: outcome.result === "failed" ? 1 : 0,
    status: "completed" as const,
    items: [
      outcome.result === "failed"
        ? {
            inputUrl: "https://example.com/feed.xml",
            normalizedUrl: null,
            result: "failed" as const,
            sourceId: null,
            errorMessage: outcome.errorMessage,
          }
        : {
            inputUrl: "https://example.com/feed.xml",
            normalizedUrl: outcome.normalizedUrl,
            result: outcome.result,
            sourceId: outcome.sourceId,
            errorMessage: null,
          },
    ],
  };
}

async function loadSourceActionsModule() {
  return import(`./source-actions.ts?test=${Date.now()}-${Math.random()}`);
}

function createSourceImportModuleMocks(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    enqueueOpmlSourceImport: mock(async () => ({
      importRunId: "import-run-opml-1",
      totalCount: 3,
      processedCount: 0,
      createdCount: 0,
      skippedCount: 0,
      failedCount: 0,
      status: "pending" as const,
      failedItems: [],
    })),
    getSourceImportRunProgress: mock(async () => null),
    runSourceImport: mock(async () =>
      createSingleImportResult({
        result: "created",
        normalizedUrl: "https://example.com/feed.xml",
        sourceId: "source-1",
      }),
    ),
    ...overrides,
  };
}

test("addSource returns created result and revalidates pages", async () => {
  const revalidatePath = mock(() => {});
  const runSourceImport = mock(async () =>
    createSingleImportResult({
      result: "created",
      normalizedUrl: "https://example.com/feed.xml",
      sourceId: "source-1",
    }),
  );

  mock.module("next/cache", () => ({
    revalidatePath,
  }));
  mock.module("@/services/source-import", () => createSourceImportModuleMocks({ runSourceImport }));

  const { addSource } = await loadSourceActionsModule();
  const result = await addSource("https://example.com/feed.xml");

  expect(runSourceImport).toHaveBeenCalledWith({
    mode: "single",
    url: "https://example.com/feed.xml",
  });
  expect(result).toEqual({
    status: "created",
    message: "Source added.",
    normalizedUrl: "https://example.com/feed.xml",
    sourceId: "source-1",
  });
  expect(revalidatePath).toHaveBeenCalledTimes(2);
  expect(revalidatePath).toHaveBeenCalledWith("/sources");
  expect(revalidatePath).toHaveBeenCalledWith("/");
});

test("addSource returns skipped_duplicate result without treating it as an error", async () => {
  const revalidatePath = mock(() => {});
  const runSourceImport = mock(async () =>
    createSingleImportResult({
      result: "skipped_duplicate",
      normalizedUrl: "https://example.com/feed.xml",
      sourceId: "source-1",
    }),
  );

  mock.module("next/cache", () => ({
    revalidatePath,
  }));
  mock.module("@/services/source-import", () => createSourceImportModuleMocks({ runSourceImport }));

  const { addSource } = await loadSourceActionsModule();
  const result = await addSource("https://example.com/feed.xml");

  expect(result).toEqual({
    status: "skipped_duplicate",
    message: "Source already exists.",
    normalizedUrl: "https://example.com/feed.xml",
    sourceId: "source-1",
  });
  expect(revalidatePath).toHaveBeenCalledTimes(2);
});

test("addSource returns feed validation failures without revalidating", async () => {
  const revalidatePath = mock(() => {});
  const runSourceImport = mock(async () =>
    createSingleImportResult({
      result: "failed",
      errorMessage: "[services/source] Response is not a valid RSS or Atom feed.",
    }),
  );

  mock.module("next/cache", () => ({
    revalidatePath,
  }));
  mock.module("@/services/source-import", () => createSourceImportModuleMocks({ runSourceImport }));

  const { addSource } = await loadSourceActionsModule();
  const result = await addSource("https://example.com/feed.xml");

  expect(result).toEqual({
    status: "failed",
    message: "[services/source] Response is not a valid RSS or Atom feed.",
  });
  expect(revalidatePath).not.toHaveBeenCalled();
});

test("importSourcesFromOpml enqueues batch import and returns queued result", async () => {
  const revalidatePath = mock(() => {});
  const enqueueOpmlSourceImport = mock(async () => ({
    importRunId: "import-run-opml-1",
    totalCount: 3,
    processedCount: 0,
    createdCount: 0,
    skippedCount: 0,
    failedCount: 0,
    status: "pending" as const,
    failedItems: [],
  }));

  mock.module("next/cache", () => ({
    revalidatePath,
  }));
  mock.module("@/services/source-import", () => createSourceImportModuleMocks({ enqueueOpmlSourceImport }));

  const { importSourcesFromOpml } = await loadSourceActionsModule();
  const result = await importSourcesFromOpml("<opml><body /></opml>");

  expect(enqueueOpmlSourceImport).toHaveBeenCalledWith("<opml><body /></opml>");
  expect(result).toEqual({
    status: "queued",
    importRunId: "import-run-opml-1",
    totalCount: 3,
    createdCount: 0,
    skippedCount: 0,
    failedCount: 0,
    failedItems: [],
  });
  expect(revalidatePath).not.toHaveBeenCalled();
});

test("importSourcesFromOpml returns failed result without revalidating when import throws", async () => {
  const revalidatePath = mock(() => {});
  const enqueueOpmlSourceImport = mock(async () => {
    throw new Error("[services/source-import] OPML import failed: bad xml");
  });
  const originalConsoleError = console.error;
  console.error = mock(() => {}) as typeof console.error;

  try {
    mock.module("next/cache", () => ({
      revalidatePath,
    }));
    mock.module("@/services/source-import", () => createSourceImportModuleMocks({ enqueueOpmlSourceImport }));

    const { importSourcesFromOpml } = await loadSourceActionsModule();
    const result = await importSourcesFromOpml("broken");

    expect(result).toEqual({
      status: "failed",
      message: "[services/source-import] OPML import failed: bad xml",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  } finally {
    console.error = originalConsoleError;
  }
});

test("getOpmlImportRunStatus returns running progress without revalidation", async () => {
  const revalidatePath = mock(() => {});
  const getSourceImportRunProgress = mock(async () => ({
    importRunId: "import-run-opml-1",
    totalCount: 4,
    processedCount: 2,
    createdCount: 1,
    skippedCount: 0,
    failedCount: 1,
    status: "running" as const,
    failedItems: [
      {
        inputUrl: "https://example.com/bad-a.xml",
        errorMessage: "timeout",
      },
    ],
  }));

  mock.module("next/cache", () => ({
    revalidatePath,
  }));
  mock.module("@/services/source-import", () => createSourceImportModuleMocks({ getSourceImportRunProgress }));

  const { getOpmlImportRunStatus } = await loadSourceActionsModule();
  const result = await getOpmlImportRunStatus("import-run-opml-1");

  expect(result).toEqual({
    status: "running",
    importRunId: "import-run-opml-1",
    totalCount: 4,
    processedCount: 2,
    createdCount: 1,
    skippedCount: 0,
    failedCount: 1,
    failedItems: [
      {
        inputUrl: "https://example.com/bad-a.xml",
        errorMessage: "timeout",
      },
    ],
  });
  expect(revalidatePath).not.toHaveBeenCalled();
});

test("getOpmlImportRunStatus revalidates when run completes", async () => {
  const revalidatePath = mock(() => {});
  const getSourceImportRunProgress = mock(async () => ({
    importRunId: "import-run-opml-1",
    totalCount: 4,
    processedCount: 4,
    createdCount: 1,
    skippedCount: 1,
    failedCount: 2,
    status: "completed" as const,
    failedItems: [
      {
        inputUrl: "https://example.com/bad-a.xml",
        errorMessage: "timeout",
      },
      {
        inputUrl: "https://example.com/bad-b.xml",
        errorMessage: "invalid feed",
      },
    ],
  }));

  mock.module("next/cache", () => ({
    revalidatePath,
  }));
  mock.module("@/services/source-import", () => createSourceImportModuleMocks({ getSourceImportRunProgress }));

  const { getOpmlImportRunStatus } = await loadSourceActionsModule();
  const result = await getOpmlImportRunStatus("import-run-opml-1");

  expect(result).toEqual({
    status: "completed",
    importRunId: "import-run-opml-1",
    totalCount: 4,
    processedCount: 4,
    createdCount: 1,
    skippedCount: 1,
    failedCount: 2,
    failedItems: [
      {
        inputUrl: "https://example.com/bad-a.xml",
        errorMessage: "timeout",
      },
      {
        inputUrl: "https://example.com/bad-b.xml",
        errorMessage: "invalid feed",
      },
    ],
  });
  expect(revalidatePath).toHaveBeenCalledTimes(2);
});
