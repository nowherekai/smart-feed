import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DigestMarkdownContent } from "./digest-markdown-content";

test("DigestMarkdownContent renders headings, quotes, lists, links, and rules as structured markup", () => {
  const html = renderToStaticMarkup(
    <DigestMarkdownContent
      markdown={[
        "# [smart-feed] 日报 2026-04-11",
        "",
        "## Technology",
        "",
        "### CyberAgent moves faster with ChatGPT Enterprise and Codex",
        "",
        "> 摘要内容",
        "",
        "- Point A",
        "- Point B",
        "",
        "来源: OpenAI News",
        "原文: [原文链接](https://openai.com/index/cyberagent)",
        "",
        "---",
      ].join("\n")}
    />,
  );

  expect(html).toContain("<h1");
  expect(html).toContain("[smart-feed] 日报 2026-04-11");
  expect(html).toContain("<h2");
  expect(html).toContain("Technology");
  expect(html).toContain("<h3");
  expect(html).toContain("CyberAgent moves faster with ChatGPT Enterprise and Codex");
  expect(html).toContain("<blockquote");
  expect(html).toContain("摘要内容");
  expect(html).toContain("<ul");
  expect(html).toContain("<li");
  expect(html).toContain("Point A");
  expect(html).toContain("<a");
  expect(html).toContain('href="https://openai.com/index/cyberagent"');
  expect(html).toContain('target="_blank"');
  expect(html).toContain("<hr");
});

test("DigestMarkdownContent skips raw html instead of rendering it as trusted markup", () => {
  const html = renderToStaticMarkup(
    <DigestMarkdownContent
      markdown={'安全文本\n\n<script>alert("xss")</script>\n\n<img src="x" onerror="alert(1)" />'}
    />,
  );

  expect(html).toContain("安全文本");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("alert(&quot;xss&quot;)");
  expect(html).not.toContain("<img");
  expect(html).not.toContain("onerror=");
});
