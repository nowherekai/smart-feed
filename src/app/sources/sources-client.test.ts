import { expect, test } from "bun:test";
import { getAddSourceFeedback } from "./sources-client";

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
