import { expect, test } from "bun:test";
import {
  getAddSourceFeedback,
  getNextOpmlImportResult,
  getOpmlImportFeedback,
  getPersistedOpmlImportRunId,
} from "./sources-client";

test("getAddSourceFeedback marks created result as success and clears input", () => {
  const feedback = getAddSourceFeedback({
    status: "created",
    message: "Source added.",
    normalizedUrl: "https://example.com/feed.xml",
    sourceId: "source-1",
  });

  expect(feedback).toEqual({
    tone: "success",
    message: "Source added.",
    shouldClearInput: true,
    shouldRefresh: true,
  });
});

test("getAddSourceFeedback treats duplicate result as a success notification", () => {
  const feedback = getAddSourceFeedback({
    status: "skipped_duplicate",
    message: "Source already exists.",
    normalizedUrl: "https://example.com/feed.xml",
    sourceId: "source-1",
  });

  expect(feedback).toEqual({
    tone: "success",
    message: "Source already exists.",
    shouldClearInput: true,
    shouldRefresh: true,
  });
});

test("getAddSourceFeedback keeps input on failed result", () => {
  const feedback = getAddSourceFeedback({
    status: "failed",
    message: "Feed is invalid.",
  });

  expect(feedback).toEqual({
    tone: "error",
    message: "Feed is invalid.",
    shouldClearInput: false,
    shouldRefresh: false,
  });
});

test("getOpmlImportFeedback treats completed batch import as success and clears selected file", () => {
  const feedback = getOpmlImportFeedback({
    status: "completed",
    importRunId: "import-run-1",
    totalCount: 6,
    createdCount: 4,
    skippedCount: 2,
    failedCount: 0,
    failedItems: [],
  });

  expect(feedback).toEqual({
    tone: "success",
    message: "OPML 导入完成，共 6 条：新增 4，已存在 2。",
    shouldClearFile: true,
    shouldRefresh: true,
  });
});

test("getOpmlImportFeedback treats queued import as background success", () => {
  const feedback = getOpmlImportFeedback({
    status: "queued",
    importRunId: "import-run-queued-1",
    totalCount: 6,
    createdCount: 0,
    skippedCount: 0,
    failedCount: 0,
    failedItems: [],
  });

  expect(feedback).toEqual({
    tone: "success",
    message: "OPML 已提交，后台开始导入，共 6 条。",
    shouldClearFile: true,
    shouldRefresh: false,
  });
});

test("getOpmlImportFeedback reports running progress without refresh", () => {
  const feedback = getOpmlImportFeedback({
    status: "running",
    importRunId: "import-run-running-1",
    totalCount: 6,
    processedCount: 2,
    createdCount: 1,
    skippedCount: 0,
    failedCount: 1,
    failedItems: [
      {
        inputUrl: "https://example.com/a.xml",
        errorMessage: "timeout",
      },
    ],
  });

  expect(feedback).toEqual({
    tone: "success",
    message: "OPML 正在后台导入，已处理 2/6 条。",
    shouldClearFile: false,
    shouldRefresh: false,
  });
});

test("getOpmlImportFeedback keeps partial success as success notification", () => {
  const feedback = getOpmlImportFeedback({
    status: "completed",
    importRunId: "import-run-2",
    totalCount: 5,
    createdCount: 2,
    skippedCount: 1,
    failedCount: 2,
    failedItems: [
      {
        inputUrl: "https://example.com/a.xml",
        errorMessage: "timeout",
      },
      {
        inputUrl: "https://example.com/b.xml",
        errorMessage: "invalid feed",
      },
    ],
  });

  expect(feedback).toEqual({
    tone: "success",
    message: "OPML 导入完成，共 5 条：新增 2，已存在 1，失败 2。",
    shouldClearFile: true,
    shouldRefresh: true,
  });
});

test("getOpmlImportFeedback keeps selected file on failed action result", () => {
  const feedback = getOpmlImportFeedback({
    status: "failed",
    message: "OPML import failed: bad xml",
  });

  expect(feedback).toEqual({
    tone: "error",
    message: "OPML import failed: bad xml",
    shouldClearFile: false,
    shouldRefresh: false,
  });
});

test("getNextOpmlImportResult clears previous success when current import fails", () => {
  const previousResult = getNextOpmlImportResult({
    status: "completed",
    importRunId: "import-run-1",
    totalCount: 3,
    createdCount: 2,
    skippedCount: 1,
    failedCount: 0,
    failedItems: [],
  });

  expect(previousResult).not.toBeNull();
  expect(
    getNextOpmlImportResult({
      status: "failed",
      message: "OPML import failed: bad xml",
    }),
  ).toBeNull();
});

test("getNextOpmlImportResult ignores queued state", () => {
  expect(
    getNextOpmlImportResult({
      status: "queued",
      importRunId: "import-run-queued-1",
      totalCount: 2,
      createdCount: 0,
      skippedCount: 0,
      failedCount: 0,
      failedItems: [],
    }),
  ).toBeNull();
});

test("getPersistedOpmlImportRunId keeps active OPML runs", () => {
  expect(
    getPersistedOpmlImportRunId({
      status: "running",
      importRunId: "import-run-running-1",
      totalCount: 2,
      processedCount: 1,
      createdCount: 1,
      skippedCount: 0,
      failedCount: 0,
      failedItems: [],
    }),
  ).toBe("import-run-running-1");
});

test("getPersistedOpmlImportRunId drops completed OPML runs", () => {
  expect(
    getPersistedOpmlImportRunId({
      status: "completed",
      importRunId: "import-run-completed-1",
      totalCount: 2,
      processedCount: 2,
      createdCount: 1,
      skippedCount: 1,
      failedCount: 0,
      failedItems: [],
    }),
  ).toBeNull();
});
