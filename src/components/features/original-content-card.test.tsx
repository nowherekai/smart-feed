import { afterEach, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

afterEach(() => {
  mock.restore();
});

async function loadCardModule() {
  mock.module("next/link", () => ({
    default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
      <a href={href} {...props}>
        {children}
      </a>
    ),
  }));

  return import(`./original-content-card.tsx?test=${Date.now()}-${Math.random()}`);
}

test("OriginalContentCard keeps the detail link separate from the external source link", async () => {
  const { OriginalContentCard } = await loadCardModule();
  const html = renderToStaticMarkup(
    <OriginalContentCard
      timeZone="Asia/Shanghai"
      record={{
        id: "content-1",
        sourceId: "source-1",
        sourceName: "Example Feed",
        title: "Article Title",
        author: "Kai",
        originalUrl: "https://example.com/post",
        effectiveAt: new Date("2026-04-02T08:00:00.000Z"),
        previewText: "Preview text",
      }}
    />,
  );

  expect(html).toContain('href="/original-content/content-1"');
  expect(html).toContain('href="https://example.com/post"');
  expect(html).toContain('target="_blank"');
  expect(html).toMatch(/href="\/original-content\/content-1"[\s\S]*<\/a><div data-slot="card-footer"/);
  expect(html).toMatch(/<div data-slot="card-footer"[\s\S]*href="https:\/\/example\.com\/post"/);
});
