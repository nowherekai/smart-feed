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

function createOpmlImportResult({
  createdCount,
  skippedCount,
  failedItems,
}: {
  createdCount: number;
  skippedCount: number;
  failedItems: Array<{ inputUrl: string; errorMessage: string }>;
}) {
  const createdItems = Array.from({ length: createdCount }, (_, index) => ({
    inputUrl: `https://example.com/created-${index + 1}.xml`,
    normalizedUrl: `https://example.com/created-${index + 1}.xml`,
    result: "created" as const,
    sourceId: `source-created-${index + 1}`,
    errorMessage: null,
  }));
  const skippedItems = Array.from({ length: skippedCount }, (_, index) => ({
    inputUrl: `https://example.com/skipped-${index + 1}.xml`,
    normalizedUrl: `https://example.com/skipped-${index + 1}.xml`,
    result: "skipped_duplicate" as const,
    sourceId: `source-skipped-${index + 1}`,
    errorMessage: null,
  }));
  const failedImportItems = failedItems.map((item) => ({
    inputUrl: item.inputUrl,
    normalizedUrl: null,
    result: "failed" as const,
    sourceId: null,
    errorMessage: item.errorMessage,
  }));

  return {
    importRunId: "import-run-opml-1",
    mode: "opml" as const,
    totalCount: createdCount + skippedCount + failedItems.length,
    createdCount,
    skippedCount,
    failedCount: failedItems.length,
    status: "completed" as const,
    items: [...createdItems, ...skippedItems, ...failedImportItems],
  };
}

async function loadSourceActionsModule() {
  return import(`./source-actions.ts?test=${Date.now()}-${Math.random()}`);
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
  mock.module("@/services/source-import", () => ({
    runSourceImport,
  }));

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
  mock.module("@/services/source-import", () => ({
    runSourceImport,
  }));

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
  mock.module("@/services/source-import", () => ({
    runSourceImport,
  }));

  const { addSource } = await loadSourceActionsModule();
  const result = await addSource("https://example.com/feed.xml");

  expect(result).toEqual({
    status: "failed",
    message: "[services/source] Response is not a valid RSS or Atom feed.",
  });
  expect(revalidatePath).not.toHaveBeenCalled();
});

test("importSourcesFromOpml returns summarized batch result and revalidates pages", async () => {
  const revalidatePath = mock(() => {});
  const runSourceImport = mock(async () =>
    createOpmlImportResult({
      createdCount: 2,
      skippedCount: 1,
      failedItems: [],
    }),
  );

  mock.module("next/cache", () => ({
    revalidatePath,
  }));
  mock.module("@/services/source-import", () => ({
    runSourceImport,
  }));

  const { importSourcesFromOpml } = await loadSourceActionsModule();
  const result = await importSourcesFromOpml("<opml><body /></opml>");

  expect(runSourceImport).toHaveBeenCalledWith({
    mode: "opml",
    opml: "<opml><body /></opml>",
  });
  expect(result).toEqual({
    status: "completed",
    importRunId: "import-run-opml-1",
    totalCount: 3,
    createdCount: 2,
    skippedCount: 1,
    failedCount: 0,
    failedItems: [],
  });
  expect(revalidatePath).toHaveBeenCalledTimes(2);
  expect(revalidatePath).toHaveBeenCalledWith("/sources");
  expect(revalidatePath).toHaveBeenCalledWith("/");
});

test("importSourcesFromOpml returns failed result without revalidating when import throws", async () => {
  const revalidatePath = mock(() => {});
  const runSourceImport = mock(async () => {
    throw new Error("[services/source-import] OPML import failed: bad xml");
  });
  const originalConsoleError = console.error;
  console.error = mock(() => {}) as typeof console.error;

  try {
    mock.module("next/cache", () => ({
      revalidatePath,
    }));
    mock.module("@/services/source-import", () => ({
      runSourceImport,
    }));

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

test("importSourcesFromOpml only exposes failed item details from mixed batch results", async () => {
  const revalidatePath = mock(() => {});
  const runSourceImport = mock(async () =>
    createOpmlImportResult({
      createdCount: 1,
      skippedCount: 1,
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
    }),
  );

  mock.module("next/cache", () => ({
    revalidatePath,
  }));
  mock.module("@/services/source-import", () => ({
    runSourceImport,
  }));

  const { importSourcesFromOpml } = await loadSourceActionsModule();
  const result = await importSourcesFromOpml("<opml />");

  expect(result).toEqual({
    status: "completed",
    importRunId: "import-run-opml-1",
    totalCount: 4,
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
