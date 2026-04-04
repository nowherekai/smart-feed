import { expect, test } from "bun:test";

import {
  normalizeHeavySummaryCandidate,
  normalizeLanguage,
  normalizeSentiment,
  normalizeValueScore,
} from "./normalizers";

test("normalizeLanguage maps localized aliases to canonical codes", () => {
  expect(normalizeLanguage("中文")).toBe("zh");
  expect(normalizeLanguage("English")).toBe("en");
  expect(normalizeLanguage("ja")).toBe("ja");
});

test("normalizeSentiment maps localized values to schema enum", () => {
  expect(normalizeSentiment("积极")).toBe("positive");
  expect(normalizeSentiment("中性")).toBe("neutral");
  expect(normalizeSentiment("负面")).toBe("negative");
  expect(normalizeSentiment("复杂")).toBe("mixed");
});

test("normalizeValueScore handles fractions and percentages", () => {
  expect(normalizeValueScore(0.65)).toBe(7);
  expect(normalizeValueScore("85")).toBe(9);
  expect(normalizeValueScore("7/10")).toBe(7);
  expect(normalizeValueScore("unknown")).toBeUndefined();
});

test("normalizeHeavySummaryCandidate trims and truncates points to three items", () => {
  expect(
    normalizeHeavySummaryCandidate({
      一句话总结: "  一句话总结  ",
      关注理由: " 值得关注 ",
      引用片段: " 原文证据 ",
      要点列表: "第一点；第二点；第三点；第四点",
    }),
  ).toEqual({
    evidenceSnippet: "原文证据",
    oneline: "一句话总结",
    points: ["第一点", "第二点", "第三点"],
    reason: "值得关注",
  });
});
