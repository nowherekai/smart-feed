import Parser from "rss-parser";

import { hashUrl, normalizeUrl } from "../utils";

type ParserFeedFields = Record<string, never>;

type ParserItemFields = {
  "content:encoded"?: string;
  author?: string;
  creator?: string;
  description?: string;
  id?: string;
  summary?: string;
};

const rssParser = new Parser<ParserFeedFields, ParserItemFields>({
  customFields: {
    item: ["content:encoded", "author", "creator", "description", "id", "summary"],
  },
});

type ParseRssFeedInput = {
  fetchedAt: Date;
  feedUrl: string;
  xml: string;
};

export type ParsedRssItem = {
  author: string | null;
  externalId: string | null;
  fetchedAt: Date;
  normalizedOriginalUrl: string | null;
  originalUrl: string | null;
  originalUrlHash: string | null;
  publishedAt: Date | null;
  rawBody: string;
  rawExcerpt: string | null;
  rawPayload: Record<string, unknown>;
  title: string | null;
};

export type ParsedRssFeed = {
  items: ParsedRssItem[];
  siteUrl: string | null;
  title: string | null;
};

function normalizeOptionalString(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parseOptionalDate(value: string | undefined): Date | null {
  const normalized = normalizeOptionalString(value);

  if (!normalized) {
    return null;
  }

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeOptionalUrl(value: string | undefined): {
  normalizedOriginalUrl: string | null;
  originalUrl: string | null;
  originalUrlHash: string | null;
} {
  const originalUrl = normalizeOptionalString(value);

  if (!originalUrl) {
    return {
      normalizedOriginalUrl: null,
      originalUrl: null,
      originalUrlHash: null,
    };
  }

  try {
    return {
      normalizedOriginalUrl: normalizeUrl(originalUrl),
      originalUrl,
      originalUrlHash: hashUrl(originalUrl),
    };
  } catch {
    return {
      normalizedOriginalUrl: null,
      originalUrl: null,
      originalUrlHash: null,
    };
  }
}

function getRawContent(item: Parser.Item & ParserItemFields) {
  const fullBody = normalizeOptionalString(item["content:encoded"]) ?? normalizeOptionalString(item.content);
  const excerpt =
    normalizeOptionalString(item.summary) ??
    normalizeOptionalString(item.description) ??
    normalizeOptionalString(item.contentSnippet);

  return {
    rawBody: fullBody ?? excerpt ?? "",
    rawExcerpt: excerpt,
  };
}

export async function parseRssFeed({ xml, fetchedAt }: ParseRssFeedInput): Promise<ParsedRssFeed> {
  const parsedFeed = await rssParser.parseString(xml);

  return {
    title: normalizeOptionalString(parsedFeed.title),
    siteUrl: normalizeOptionalString(parsedFeed.link),
    items: parsedFeed.items.map((item) => {
      const urls = normalizeOptionalUrl(item.link);
      const rawContent = getRawContent(item);

      return {
        author: normalizeOptionalString(item.creator) ?? normalizeOptionalString(item.author),
        externalId: normalizeOptionalString(item.guid) ?? normalizeOptionalString(item.id),
        fetchedAt,
        normalizedOriginalUrl: urls.normalizedOriginalUrl,
        originalUrl: urls.originalUrl,
        originalUrlHash: urls.originalUrlHash,
        publishedAt: parseOptionalDate(item.isoDate) ?? parseOptionalDate(item.pubDate),
        rawBody: rawContent.rawBody,
        rawExcerpt: rawContent.rawExcerpt,
        rawPayload: {
          author: normalizeOptionalString(item.author),
          categories: item.categories ?? [],
          contentSnippet: normalizeOptionalString(item.contentSnippet),
          creator: normalizeOptionalString(item.creator),
          guid: normalizeOptionalString(item.guid),
          isoDate: normalizeOptionalString(item.isoDate),
          link: normalizeOptionalString(item.link),
          pubDate: normalizeOptionalString(item.pubDate),
        },
        title: normalizeOptionalString(item.title),
      };
    }),
  };
}
