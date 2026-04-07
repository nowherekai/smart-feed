import { expect, test } from "bun:test";
import { XMLParser } from "fast-xml-parser";
import { buildSourcesOpml } from "./opml-export";

const parser = new XMLParser({
  attributeNamePrefix: "",
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

type ParsedOutline = {
  htmlUrl?: string;
  text: string;
  title: string;
  type: string;
  xmlUrl: string;
};

function toOutlineArray(value: ParsedOutline | ParsedOutline[] | undefined): ParsedOutline[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

test("buildSourcesOpml falls back to identifier when title is empty", () => {
  const xml = buildSourcesOpml([
    {
      identifier: "https://example.com/feed.xml",
      title: null,
      siteUrl: null,
    },
  ]);

  const parsed = parser.parse(xml) as {
    opml: {
      body: {
        outline: ParsedOutline;
      };
    };
  };

  expect(parsed.opml.body.outline.text).toBe("https://example.com/feed.xml");
  expect(parsed.opml.body.outline.title).toBe("https://example.com/feed.xml");
  expect(parsed.opml.body.outline.xmlUrl).toBe("https://example.com/feed.xml");
});

test("buildSourcesOpml escapes XML-sensitive characters in title and URLs", () => {
  const xml = buildSourcesOpml([
    {
      identifier: "https://example.com/feed.xml?a=1&b=2",
      title: `A & B <C> "D" 'E'`,
      siteUrl: "https://example.com/?x=1&y=2",
    },
  ]);

  expect(xml).toContain('text="A &amp; B &lt;C&gt; &quot;D&quot; &apos;E&apos;"');
  expect(xml).toContain('xmlUrl="https://example.com/feed.xml?a=1&amp;b=2"');
  expect(xml).toContain('htmlUrl="https://example.com/?x=1&amp;y=2"');
});

test("buildSourcesOpml only writes htmlUrl when siteUrl exists", () => {
  const xml = buildSourcesOpml([
    {
      identifier: "https://example.com/a.xml",
      title: "Feed A",
      siteUrl: null,
    },
    {
      identifier: "https://example.com/b.xml",
      title: "Feed B",
      siteUrl: "https://example.com/b",
    },
  ]);

  const parsed = parser.parse(xml) as {
    opml: {
      body: {
        outline: ParsedOutline[];
      };
    };
  };
  const outlines = toOutlineArray(parsed.opml.body.outline);

  expect(outlines[0]?.htmlUrl).toBeUndefined();
  expect(outlines[1]?.htmlUrl).toBe("https://example.com/b");
});

test("buildSourcesOpml returns a legal empty OPML document when no sources exist", () => {
  const xml = buildSourcesOpml([]);
  const parsed = parser.parse(xml) as {
    opml: {
      body: {
        outline?: ParsedOutline | ParsedOutline[];
      };
      head: {
        title: string;
      };
    };
  };

  expect(parsed.opml.head.title).toBe("smart-feed Sources");
  expect(parsed.opml.body.outline).toBeUndefined();
  expect(xml).toContain("  <body>\n  </body>");
});

test("buildSourcesOpml preserves each source as a flat outline entry", () => {
  const xml = buildSourcesOpml([
    {
      identifier: "https://example.com/active.xml",
      title: "Active Feed",
      siteUrl: null,
    },
    {
      identifier: "https://example.com/paused.xml",
      title: "Paused Feed",
      siteUrl: null,
    },
    {
      identifier: "https://example.com/blocked.xml",
      title: "Blocked Feed",
      siteUrl: null,
    },
  ]);

  const parsed = parser.parse(xml) as {
    opml: {
      body: {
        outline: ParsedOutline[];
      };
    };
  };
  const outlines = toOutlineArray(parsed.opml.body.outline);

  expect(outlines).toHaveLength(3);
  expect(outlines.map((outline) => outline.xmlUrl)).toEqual([
    "https://example.com/active.xml",
    "https://example.com/paused.xml",
    "https://example.com/blocked.xml",
  ]);
});
