import { expect, test } from "bun:test";

import { parseOpml } from "./opml";

test("parseOpml extracts nested xmlUrl entries from OPML 2.0", () => {
  const sources = parseOpml(`<?xml version="1.0" encoding="UTF-8"?>
    <opml version="2.0">
      <head>
        <title>Subscriptions</title>
      </head>
      <body>
        <outline text="Tech">
          <outline text="Feed A" title="Feed A" type="rss" xmlUrl="https://example.com/a.xml" htmlUrl="https://example.com/a" />
          <outline text="Feed B" type="rss" xmlUrl="https://example.com/b.xml" />
        </outline>
      </body>
    </opml>`);

  expect(sources).toEqual([
    {
      text: "Feed A",
      title: "Feed A",
      xmlUrl: "https://example.com/a.xml",
      htmlUrl: "https://example.com/a",
    },
    {
      text: "Feed B",
      title: null,
      xmlUrl: "https://example.com/b.xml",
      htmlUrl: null,
    },
  ]);
});

test("parseOpml keeps duplicate xmlUrl entries and ignores outline nodes without xmlUrl", () => {
  const sources = parseOpml(`<?xml version="1.0"?>
    <opml version="1.0">
      <body>
        <outline text="Folder">
          <outline text="Feed A" xmlUrl="https://example.com/a.xml" />
          <outline text="Feed A Copy" xmlUrl="https://example.com/a.xml" />
          <outline text="Folder without feed">
            <outline text="Feed C" xmlurl="https://example.com/c.xml" />
          </outline>
        </outline>
      </body>
    </opml>`);

  expect(sources.map((source) => source.xmlUrl)).toEqual([
    "https://example.com/a.xml",
    "https://example.com/a.xml",
    "https://example.com/c.xml",
  ]);
});
