/**
 * 全文抓取服务模块
 * 负责从原始 URL 获取网页的 HTML 内容。
 * 包含：网络请求发送、User-Agent 模拟、超时控制及简单的 HTML 内容判定。
 */

import { DOMParser } from "linkedom";
import { logger } from "../utils";

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

/** 规范化空白字符 */
function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** 剥离所有 HTML 标签并规范化空白 */
function stripHtmlTags(value: string): string {
  return normalizeWhitespace(value.replace(/<[^>]+>/g, " "));
}

/** 简单的正则判断内容是否像 HTML */
function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

/** 从 HTML 中获取文本统计指标 */
function getTextMetricsFromHtml(rawBody: string) {
  const document = new DOMParser().parseFromString(rawBody, "text/html") as unknown as ParsedHtmlDocument;
  const paragraphCount = document.querySelectorAll("p, li, blockquote").length;
  const textLength = stripHtmlTags(rawBody).length;

  return {
    paragraphCount,
    textLength,
  };
}

/**
 * 抓取网页全文 HTML
 * 1. 发送 HTTP 请求并设置超时。
 * 2. 检查状态码。
 * 3. 确保返回内容不为空。
 * 4. 若返回的是纯文本，则包装在简单的 HTML 骨架中。
 */
export async function fetchPageHtml(url: string, deps: FetchPageHtmlDeps = {}): Promise<string> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  logger.info("Fetching page HTML", { url });

  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: HTML_ACCEPT_HEADER,
        "user-agent": SMART_FEED_USER_AGENT,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000), // 15秒超时
    });

    if (!response.ok) {
      const errorMsg = `[services/html-fetcher] Page fetch returned ${response.status}.`;
      logger.error(errorMsg, { url, status: response.status });
      throw new Error(errorMsg);
    }

    const html = await response.text();

    if (!html.trim()) {
      const errorMsg = "[services/html-fetcher] Page fetch returned an empty response.";
      logger.warn(errorMsg, { url });
      throw new Error(errorMsg);
    }

    const isHtml = looksLikeHtml(html);
    logger.info("Page HTML fetched successfully", {
      url,
      htmlLength: html.length,
      isHtml,
    });

    return isHtml ? html : `<html><body><pre>${html}</pre></body></html>`;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown fetch error";
    logger.error("Page HTML fetch failed", { url, error: errorMessage });
    throw error;
  }
}

/**
 * 获取原始内容的摘要备选项
 */
export function getRawBodyExcerptCandidate(rawBody: string): string | null {
  const trimmed = rawBody.trim();
  return trimmed ? trimmed : null;
}

/**
 * 获取内容的纯文本长度（剥离标签后）
 */
export function getRawTextLength(value: string): number {
  return looksLikeHtml(value) ? getTextMetricsFromHtml(value).textLength : stripHtmlTags(value).length;
}
