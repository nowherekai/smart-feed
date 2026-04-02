import { expect, test } from "bun:test";
import { createOriginalContentPreview } from "./original-content-preview";

test("createOriginalContentPreview prefers rawExcerpt when available", () => {
  const preview = createOriginalContentPreview({
    rawBody: "<p>body content</p>",
    rawExcerpt: "<p>excerpt content</p>",
  });

  expect(preview).toBe("excerpt content");
});

test("createOriginalContentPreview falls back to rawBody and strips html", () => {
  const preview = createOriginalContentPreview({
    rawBody: "<article><p>Hello</p><p>world</p></article>",
    rawExcerpt: null,
  });

  expect(preview).toBe("Hello world");
});

test("createOriginalContentPreview truncates long text with ellipsis", () => {
  const preview = createOriginalContentPreview(
    {
      rawBody: "a".repeat(20),
      rawExcerpt: null,
    },
    10,
  );

  expect(preview).toBe("aaaaaaaaaa…");
});
