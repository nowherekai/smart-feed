import { expect, test } from "bun:test";

import { fetchPageHtml, getRawBodyExcerptCandidate } from "./html-fetcher";

test("getRawBodyExcerptCandidate keeps non-empty feed body for fallback excerpt", () => {
  expect(getRawBodyExcerptCandidate("   <p>short excerpt</p>  ")).toBe("<p>short excerpt</p>");
  expect(getRawBodyExcerptCandidate(" \n\t ")).toBeNull();
});

test("fetchPageHtml requests HTML and wraps plain text responses", async () => {
  const calls: RequestInit[] = [];
  const html = await fetchPageHtml("https://example.com/post", {
    async fetchImpl(_input, init) {
      calls.push(init ?? {});
      return new Response("plain text", {
        status: 200,
      });
    },
  });

  expect(new Headers(calls[0]?.headers).get("accept")).toContain("text/html");
  expect(html).toContain("<html><body><pre>plain text</pre></body></html>");
});
