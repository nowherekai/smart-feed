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

test("verifyAndPrepareRssSource keeps transport error messages free of the full URL", async () => {
  await expect(
    verifyAndPrepareRssSource("https://example.com/feed.xml?token=secret", {
      fetch: async () =>
        new Response("forbidden", {
          status: 403,
        }),
    }),
  ).rejects.toThrow("[services/source] Source URL returned 403.");
});

test("verifyAndPrepareRssSource rejects non-feed responses", async () => {
  await expect(
    verifyAndPrepareRssSource("https://example.com/feed.xml", {
      fetch: async () => new Response("<html><body>not a feed</body></html>"),
    }),
  ).rejects.toThrow("not a valid RSS or Atom feed");
});

test("verifyAndPrepareRssSource accepts feeds with entity expansions above default limit", async () => {
  const encodedPrefix = "&amp;".repeat(1_500);

  const prepared = await verifyAndPrepareRssSource("https://example.com/feed.xml", {
    fetch: async () =>
      new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
         <rss version="2.0">
           <channel>
             <title>${encodedPrefix}Example Feed</title>
             <link>https://example.com?a=1&amp;b=2</link>
           </channel>
         </rss>`,
      ),
  });

  expect(prepared.title).toBe(`${"&".repeat(1_500)}Example Feed`);
  expect(prepared.siteUrl).toBe("https://example.com?a=1&b=2");
});

test("verifyAndPrepareRssSource decodes decimal and hexadecimal XML numeric entities in feed metadata", async () => {
  const prepared = await verifyAndPrepareRssSource("https://example.com/feed.xml", {
    fetch: async () =>
      new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
         <rss version="2.0">
           <channel>
             <title>AT&#38;T &#x1F680;</title>
             <link>https://example.com?a=1&#38;b=2</link>
           </channel>
         </rss>`,
      ),
  });

  expect(prepared.title).toBe("AT&T 🚀");
  expect(prepared.siteUrl).toBe("https://example.com?a=1&b=2");
});

test("verifyAndPrepareRssSource keeps malformed XML numeric entities unchanged", async () => {
  const prepared = await verifyAndPrepareRssSource("https://example.com/feed.xml", {
    fetch: async () =>
      new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
         <rss version="2.0">
           <channel>
             <title>Bad &#x110000; Entity &#9999999999999999999999;</title>
             <link>https://example.com</link>
           </channel>
         </rss>`,
      ),
  });

  expect(prepared.title).toBe("Bad &#x110000; Entity &#9999999999999999999999;");
});
