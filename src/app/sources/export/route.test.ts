import { afterEach, expect, mock, test } from "bun:test";
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  attributeNamePrefix: "",
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

type ParsedOutline = {
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

async function loadRouteModule() {
  return import(`./route.ts?test=${Date.now()}-${Math.random()}`);
}

afterEach(() => {
  mock.restore();
});

test("GET exports all RSS sources as an OPML attachment ordered by createdAt desc query", async () => {
  const findMany = mock(async () => [
    {
      identifier: "https://example.com/active.xml",
      siteUrl: "https://example.com/active",
      title: "Active Feed",
    },
    {
      identifier: "https://example.com/paused.xml",
      siteUrl: null,
      title: "Paused Feed",
    },
    {
      identifier: "https://example.com/blocked.xml",
      siteUrl: null,
      title: "Blocked Feed",
    },
  ]);
  const logger = {
    error: mock(() => undefined),
    info: mock(() => undefined),
  };

  mock.module("@/config", () => ({
    appEnv: {
      timeZone: "Asia/Shanghai",
    },
  }));
  mock.module("@/db", () => ({
    db: {
      query: {
        sources: {
          findMany,
        },
      },
    },
  }));
  mock.module("@/utils", () => ({
    createLogger: () => logger,
  }));

  const { GET } = await loadRouteModule();
  const response = await GET();
  const body = await response.text();
  const parsed = parser.parse(body) as {
    opml: {
      body: {
        outline: ParsedOutline[];
      };
      head: {
        title: string;
      };
    };
  };
  const outlines = toOutlineArray(parsed.opml.body.outline);
  const mockCalls = findMany.mock.calls as unknown[][];
  const queryOptionsRaw = mockCalls[0]?.[0];

  if (!queryOptionsRaw) {
    throw new Error("Expected findMany to be called once.");
  }
  const queryOptions = queryOptionsRaw as {
    orderBy: (table: { createdAt: string }, ops: { desc: (value: string) => string }) => string[];
    where: (
      table: { type: string },
      ops: { eq: (left: string, right: string) => { left: string; right: string } },
    ) => {
      left: string;
      right: string;
    };
  };

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/x-opml+xml; charset=utf-8");
  expect(response.headers.get("content-disposition")).toMatch(
    /^attachment; filename="smart-feed-sources-\d{4}-\d{2}-\d{2}\.opml"$/,
  );
  expect(parsed.opml.head.title).toBe("smart-feed Sources");
  expect(outlines).toHaveLength(3);
  expect(outlines.map((outline) => outline.xmlUrl)).toEqual([
    "https://example.com/active.xml",
    "https://example.com/paused.xml",
    "https://example.com/blocked.xml",
  ]);
  expect(queryOptions.where({ type: "source-type-column" }, { eq: (left, right) => ({ left, right }) })).toEqual({
    left: "source-type-column",
    right: "rss-source",
  });
  expect(queryOptions.orderBy({ createdAt: "created-at-column" }, { desc: (value) => `desc:${value}` })).toEqual([
    "desc:created-at-column",
  ]);
  expect(logger.info).toHaveBeenCalledWith("Sources OPML export generated", {
    exportCount: 3,
    sourceType: "rss-source",
  });
});

test("GET returns 500 and logs summary when export fails", async () => {
  const findMany = mock(async () => {
    throw new Error("database unavailable");
  });
  const logger = {
    error: mock(() => undefined),
    info: mock(() => undefined),
  };

  mock.module("@/config", () => ({
    appEnv: {
      timeZone: "Asia/Shanghai",
    },
  }));
  mock.module("@/db", () => ({
    db: {
      query: {
        sources: {
          findMany,
        },
      },
    },
  }));
  mock.module("@/utils", () => ({
    createLogger: () => logger,
  }));

  const { GET } = await loadRouteModule();
  const response = await GET();

  expect(response.status).toBe(500);
  expect(await response.text()).toBe("Failed to export OPML.");
  expect(logger.error).toHaveBeenCalledWith("Failed to export sources OPML", {
    error: "database unavailable",
  });
});
