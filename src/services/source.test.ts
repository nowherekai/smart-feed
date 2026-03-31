import { expect, test } from "bun:test";

import { verifyAndPrepareRssSource } from "./source";

test("verifyAndPrepareRssSource normalizes RSS URL and extracts metadata", async () => {
  let capturedRequest: RequestInit | undefined;

  const prepared = await verifyAndPrepareRssSource("HTTPS://Example.com:443/feed.xml", {
    fetch: async (_input, init) => {
      capturedRequest = init;

      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
         <rss version="2.0">
           <channel>
             <title>Example Feed</title>
             <link>https://example.com</link>
           </channel>
         </rss>`,
      );
    },
  });

  expect(prepared).toEqual({
    normalizedUrl: "https://example.com/feed.xml",
    title: "Example Feed",
    siteUrl: "https://example.com",
  });
  expect(new Headers(capturedRequest?.headers).get("user-agent")).toBe(
    "smart-feed/1.0 (+https://github.com/nowherekai/smart-feed)",
  );
});

test("verifyAndPrepareRssSource rejects unsupported protocols", async () => {
  await expect(verifyAndPrepareRssSource("ftp://example.com/feed.xml")).rejects.toThrow("Unsupported URL protocol");
});

test("verifyAndPrepareRssSource rejects non-feed responses", async () => {
  await expect(
    verifyAndPrepareRssSource("https://example.com/feed.xml", {
      fetch: async () => new Response("<html><body>not a feed</body></html>"),
    }),
  ).rejects.toThrow("not a valid RSS or Atom feed");
});
