import { expect, test } from "bun:test";

import { normalizeHeavySummaryCandidate, normalizeLanguage, normalizeValueScore } from "./normalizers";

test("normalizeLanguage maps localized aliases to canonical codes", () => {
  expect(normalizeLanguage("中文")).toBe("zh");
  expect(normalizeLanguage("English")).toBe("en");
  expect(normalizeLanguage("ja")).toBe("ja");
});

test("normalizeValueScore handles fractions and percentages", () => {
  expect(normalizeValueScore(0.65)).toBe(7);
  expect(normalizeValueScore("85")).toBe(9);
  expect(normalizeValueScore("7/10")).toBe(7);
  expect(normalizeValueScore("unknown")).toBeUndefined();
});

test("normalizeHeavySummaryCandidate trims and normalizes paragraph summaries", () => {
  expect(
    normalizeHeavySummaryCandidate({
      整体摘要: "  一段摘要  ",
      分段摘要: "第一段；第二段；第三段",
    }),
  ).toEqual({
    paragraphSummaries: ["第一段", "第二段", "第三段"],
    summary: "一段摘要",
  });
});
