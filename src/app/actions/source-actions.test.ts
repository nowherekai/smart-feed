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
