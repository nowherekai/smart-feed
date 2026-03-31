import { and, eq } from "drizzle-orm";
import { XMLParser } from "fast-xml-parser";

import { getDb, sources } from "../db";
import { normalizeUrl } from "../utils";

const feedParser = new XMLParser({
  attributeNamePrefix: "",
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

type FeedMetadata = {
  title: string | null;
  siteUrl: string | null;
};

type SourceRecord = typeof sources.$inferSelect;
type NewSource = typeof sources.$inferInsert;

export type SourceType = (typeof sources.$inferInsert)["type"];

export type PreparedRssSource = {
  normalizedUrl: string;
  title: string | null;
  siteUrl: string | null;
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type VerifyRssSourceDeps = {
  fetch?: FetchLike;
};

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractFeedMetadata(xml: string): FeedMetadata {
  const parsed = feedParser.parse(xml) as {
    rss?: { channel?: { title?: string; link?: string } };
    feed?: {
      title?: string | { "#text"?: string };
      link?: { href?: string; rel?: string } | Array<{ href?: string; rel?: string }>;
    };
    "rdf:RDF"?: { channel?: { title?: string; link?: string } };
  };

  const rssChannel = parsed.rss?.channel ?? parsed["rdf:RDF"]?.channel;

  if (rssChannel) {
    return {
      title: normalizeOptionalString(rssChannel.title),
      siteUrl: normalizeOptionalString(rssChannel.link),
    };
  }

  const atomFeed = parsed.feed;

  if (atomFeed) {
    const links = Array.isArray(atomFeed.link) ? atomFeed.link : atomFeed.link ? [atomFeed.link] : [];
    const alternateLink = links.find((link) => !link.rel || link.rel === "alternate") ?? links[0];

    return {
      title:
        typeof atomFeed.title === "string"
          ? normalizeOptionalString(atomFeed.title)
          : normalizeOptionalString(atomFeed.title?.["#text"]),
      siteUrl: normalizeOptionalString(alternateLink?.href),
    };
  }

  throw new Error("[services/source] Response is not a valid RSS or Atom feed.");
}

function assertHttpUrl(inputUrl: string): string {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(inputUrl);
  } catch {
    throw new Error(`[services/source] Invalid source URL "${inputUrl}".`);
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(`[services/source] Unsupported URL protocol "${parsedUrl.protocol}".`);
  }

  return normalizeUrl(parsedUrl.toString());
}

export async function verifyAndPrepareRssSource(
  inputUrl: string,
  deps: VerifyRssSourceDeps = {},
): Promise<PreparedRssSource> {
  const normalizedUrl = assertHttpUrl(inputUrl);
  const fetchImpl = deps.fetch ?? fetch;
  const response = await fetchImpl(normalizedUrl, {
    headers: {
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`[services/source] Source URL returned ${response.status}.`);
  }

  const body = await response.text();

  if (!body.trim()) {
    throw new Error("[services/source] Source URL returned an empty response.");
  }

  const metadata = extractFeedMetadata(body);

  return {
    normalizedUrl,
    title: metadata.title,
    siteUrl: metadata.siteUrl,
  };
}

export async function findSourceByIdentifier(
  identifier: string,
  type: SourceType = "rss-source",
): Promise<SourceRecord | null> {
  const db = getDb();
  const [source] = await db
    .select()
    .from(sources)
    .where(and(eq(sources.type, type), eq(sources.identifier, identifier)));

  return source ?? null;
}

function requireInsertedSource(source: SourceRecord | undefined): SourceRecord {
  if (!source) {
    throw new Error("[services/source] Failed to insert source.");
  }

  return source;
}

export async function createSource(data: NewSource): Promise<SourceRecord> {
  const db = getDb();
  const [source] = await db.insert(sources).values(data).returning();

  return requireInsertedSource(source);
}

export type { NewSource, SourceRecord };
