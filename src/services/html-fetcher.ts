import { DOMParser } from "linkedom";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type ParsedHtmlDocument = {
  body: {
    textContent: string | null;
  };
  querySelectorAll(selector: string): {
    length: number;
  };
};

const SMART_FEED_USER_AGENT = "smart-feed/1.0 (+https://github.com/nowherekai/smart-feed)";

const HTML_ACCEPT_HEADER = "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.1";

export type RawContentFormat = "html" | "text" | "markdown" | "transcript";

export type FetchPageHtmlDeps = {
  fetchImpl?: FetchLike;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripHtmlTags(value: string): string {
  return normalizeWhitespace(value.replace(/<[^>]+>/g, " "));
}

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function getTextMetricsFromHtml(rawBody: string) {
  const document = new DOMParser().parseFromString(rawBody, "text/html") as unknown as ParsedHtmlDocument;
  const paragraphCount = document.querySelectorAll("p, li, blockquote").length;
  const textLength = stripHtmlTags(rawBody).length;

  return {
    paragraphCount,
    textLength,
  };
}

export async function fetchPageHtml(url: string, deps: FetchPageHtmlDeps = {}): Promise<string> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const response = await fetchImpl(url, {
    headers: {
      accept: HTML_ACCEPT_HEADER,
      "user-agent": SMART_FEED_USER_AGENT,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`[services/html-fetcher] Page fetch returned ${response.status}.`);
  }

  const html = await response.text();

  if (!html.trim()) {
    throw new Error("[services/html-fetcher] Page fetch returned an empty response.");
  }

  return looksLikeHtml(html) ? html : `<html><body><pre>${html}</pre></body></html>`;
}

export function getRawBodyExcerptCandidate(rawBody: string): string | null {
  const trimmed = rawBody.trim();
  return trimmed ? trimmed : null;
}

export function getRawTextLength(value: string): number {
  return looksLikeHtml(value) ? getTextMetricsFromHtml(value).textLength : stripHtmlTags(value).length;
}
