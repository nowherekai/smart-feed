import { expect, test } from "bun:test";

import { renderDigestMarkdown } from "./digest-renderer";

test("renderDigestMarkdown includes summary text and source link for each item", () => {
  const markdown = renderDigestMarkdown({
    digestDate: "2026-03-31",
    sections: [
      {
        items: [
          {
            originalUrl: "https://example.com/post(1)",
            sourceName: "Example Feed",
            summary: {
              paragraphSummaries: ["Point A", "Point B"],
              summary: "One-line summary",
            },
            title: "Digest Item",
          },
        ],
        title: "技术动态",
      },
    ],
  });

  expect(markdown).toContain("# [smart-feed] 日报 2026-03-31");
  expect(markdown).toContain("## 技术动态");
  expect(markdown).toContain("### Digest Item");
  expect(markdown).toContain("> One-line summary");
  expect(markdown).toContain("- Point A");
  expect(markdown).toContain("来源: Example Feed");
  expect(markdown).toContain("原文: [原文链接](<https://example.com/post(1)>)");
});

test("renderDigestMarkdown renders empty digest state when no sections exist", () => {
  const markdown = renderDigestMarkdown({
    digestDate: "2026-03-31",
    sections: [],
  });

  expect(markdown).toBe("# [smart-feed] 日报 2026-03-31\n\n本次统计区间内没有符合条件的内容。");
});
