import { expect, test } from "bun:test";

import { renderDigestMarkdown } from "./digest-renderer";

test("renderDigestMarkdown includes traceability fields for each item", () => {
  const markdown = renderDigestMarkdown({
    digestDate: "2026-03-31",
    sections: [
      {
        items: [
          {
            contentTraceId: "content-123",
            evidenceSnippet: "A traceable evidence snippet.",
            originalUrl: "https://example.com/post",
            sourceName: "Example Feed",
            sourceTraceId: "source-abc",
            summary: {
              oneline: "One-line summary",
              points: ["Point A", "Point B"],
              reason: "Worth reading",
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
  expect(markdown).toContain("来源: Example Feed (`source-abc`)");
  expect(markdown).toContain("内容追踪: `content-123`");
  expect(markdown).toContain("原文: [原文链接](https://example.com/post)");
  expect(markdown).toContain("证据: A traceable evidence snippet.");
});

test("renderDigestMarkdown renders empty digest state when no sections exist", () => {
  const markdown = renderDigestMarkdown({
    digestDate: "2026-03-31",
    sections: [],
  });

  expect(markdown).toBe("# [smart-feed] 日报 2026-03-31\n\n本次统计区间内没有符合条件的内容。");
});
