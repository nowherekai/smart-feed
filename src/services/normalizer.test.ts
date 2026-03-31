import { expect, test } from "bun:test";

import { normalizeRawContent } from "./normalizer";

test("normalizeRawContent removes noise and keeps body links and images", () => {
  const result = normalizeRawContent({
    format: "html",
    originalUrl: "https://example.com/post",
    rawBody: `
      <html>
        <body>
          <nav>menu</nav>
          <article>
            <h1>Article Title</h1>
            <p>正文第一段 <a href="https://example.com/ref">参考链接</a></p>
            <div class="share">share me</div>
            <p><img src="https://example.com/image.png" alt="cover"></p>
          </article>
          <footer>footer</footer>
        </body>
      </html>
    `,
    title: "Article Title",
  });

  expect(result.truncated).toBeFalse();
  expect(result.markdown).toContain("# Article Title");
  expect(result.markdown).toContain("[参考链接](https://example.com/ref)");
  expect(result.markdown).toContain("![cover](https://example.com/image.png)");
  expect(result.markdown).not.toContain("share me");
  expect(result.markdown).not.toContain("menu");
  expect(result.markdown).not.toContain("footer");
});

test("normalizeRawContent truncates markdown to 50KB", () => {
  const repeatedParagraph = "这是一段很长的正文，用于测试截断逻辑。".repeat(400);
  const result = normalizeRawContent({
    format: "text",
    originalUrl: "https://example.com/post",
    rawBody: `${repeatedParagraph}\n\n${repeatedParagraph}\n\n${repeatedParagraph}`,
    title: "Long Article",
  });

  expect(result.truncated).toBeTrue();
  expect(new TextEncoder().encode(result.markdown).length).toBeLessThanOrEqual(50 * 1024);
  expect(result.markdown).toContain("[内容过长，已截断]");
});
