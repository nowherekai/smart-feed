import { expect, test } from "bun:test";

import { parseRssFeed } from "./rss";

test("parseRssFeed parses RSS 2.0 items with full content and excerpt", async () => {
  const parsed = await parseRssFeed({
    fetchedAt: new Date("2026-03-31T00:00:00.000Z"),
    feedUrl: "https://example.com/feed.xml",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Example RSS</title>
          <link>https://example.com</link>
          <item>
            <title>Hello</title>
            <link>https://example.com/posts/1</link>
            <guid>guid-1</guid>
            <pubDate>Tue, 31 Mar 2026 08:00:00 GMT</pubDate>
            <description><![CDATA[excerpt]]></description>
            <content:encoded><![CDATA[<p>full body</p>]]></content:encoded>
            <author>Alice</author>
          </item>
        </channel>
      </rss>`,
  });

  expect(parsed.title).toBe("Example RSS");
  expect(parsed.siteUrl).toBe("https://example.com");
  expect(parsed.items).toHaveLength(1);
  expect(parsed.items[0]).toMatchObject({
    author: "Alice",
    externalId: "guid-1",
    normalizedOriginalUrl: "https://example.com/posts/1",
    originalUrl: "https://example.com/posts/1",
    rawBody: "<p>full body</p>",
    rawExcerpt: "excerpt",
    title: "Hello",
  });
  expect(parsed.items[0]?.publishedAt?.toISOString()).toBe("2026-03-31T08:00:00.000Z");
});

test("parseRssFeed parses Atom 1.0 items and falls back to summary as rawBody", async () => {
  const parsed = await parseRssFeed({
    fetchedAt: new Date("2026-03-31T00:00:00.000Z"),
    feedUrl: "https://example.com/atom.xml",
    xml: `<?xml version="1.0" encoding="utf-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Example Atom</title>
        <link href="https://example.com" />
        <entry>
          <title>Atom entry</title>
          <link href="https://example.com/entries/1" />
          <id>tag:example.com,2026:1</id>
          <updated>2026-03-31T01:02:03Z</updated>
          <summary type="html">&lt;p&gt;summary only&lt;/p&gt;</summary>
          <author><name>Bob</name></author>
        </entry>
      </feed>`,
  });

  expect(parsed.title).toBe("Example Atom");
  expect(parsed.siteUrl).toBe("https://example.com");
  expect(parsed.items[0]).toMatchObject({
    externalId: "tag:example.com,2026:1",
    normalizedOriginalUrl: "https://example.com/entries/1",
    rawBody: "<p>summary only</p>",
    rawExcerpt: "<p>summary only</p>",
    title: "Atom entry",
  });
  expect(parsed.items[0]?.publishedAt?.toISOString()).toBe("2026-03-31T01:02:03.000Z");
});

test("parseRssFeed keeps items with missing guid and pubDate but marks missing link as unusable", async () => {
  const parsed = await parseRssFeed({
    fetchedAt: new Date("2026-03-31T00:00:00.000Z"),
    feedUrl: "https://example.com/feed.xml",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>No link</title>
            <description>excerpt</description>
          </item>
        </channel>
      </rss>`,
  });

  expect(parsed.items[0]).toMatchObject({
    externalId: null,
    normalizedOriginalUrl: null,
    originalUrl: null,
    publishedAt: null,
    rawBody: "excerpt",
    rawExcerpt: "excerpt",
    title: "No link",
  });
});
