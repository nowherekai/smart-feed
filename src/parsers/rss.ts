/**
 * RSS 解析器模块
 * 负责将原始 XML（RSS 2.0, Atom, RDF）解析并映射为系统标准的内容条目结构。
 * 包含：自定义字段处理（如 content:encoded）、URL 规范化、去重 ID 提取及发布时间解析。
 */

import Parser from "rss-parser";

import { hashUrl, normalizeUrl } from "../utils";

// 扩展 rss-parser 的类型定义
type ParserFeedFields = Record<string, never>;

type ParserItemFields = {
  "content:encoded"?: string;
  author?: string;
  creator?: string;
  description?: string;
  id?: string;
  summary?: string;
};

/**
 * 初始化解析器，配置自定义字段
 * 确保能抓取到常见的全文 HTML 字段 (content:encoded)。
 */
const rssParser = new Parser<ParserFeedFields, ParserItemFields>({
  customFields: {
    item: ["content:encoded", "author", "creator", "description", "id", "summary"],
  },
});

type ParseRssFeedInput = {
  /** 抓取发生的时间 */
  fetchedAt: Date;
  /** Feed 原始 URL */
  feedUrl: string;
  /** 待解析的 XML 字符串 */
  xml: string;
};

/** 标准化的解析后条目结构 */
export type ParsedRssItem = {
  author: string | null;
  /** 来源侧唯一 ID (GUID/Link) */
  externalId: string | null;
  fetchedAt: Date;
  /** 规范化 URL，用于去重 */
  normalizedOriginalUrl: string | null;
  /** 原始 URL */
  originalUrl: string | null;
  /** URL 的 MD5 哈希，备用去重方案 */
  originalUrlHash: string | null;
  /** 发布时间 */
  publishedAt: Date | null;
  /** 提取到的原始 HTML 或正文 */
  rawBody: string;
  /** Feed 提供的摘要（若有） */
  rawExcerpt: string | null;
  /** 原始元数据备份 */
  rawPayload: Record<string, unknown>;
  title: string | null;
};

export type ParsedRssFeed = {
  items: ParsedRssItem[];
  /** 站点首页链接 */
  siteUrl: string | null;
  /** 订阅源标题 */
  title: string | null;
};

// --- 辅助函数 ---

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

/**
 * 处理 URL 的各种规范化逻辑
 */
function normalizeOptionalUrl(value: string | undefined): {
  normalizedOriginalUrl: string | null;
  originalUrl: string | null;
  originalUrlHash: string | null;
} {
  const originalUrl = normalizeOptionalString(value);

  if (!originalUrl) {
    return { normalizedOriginalUrl: null, originalUrl: null, originalUrlHash: null };
  }

  try {
    return {
      normalizedOriginalUrl: normalizeUrl(originalUrl),
      originalUrl,
      originalUrlHash: hashUrl(originalUrl),
    };
  } catch {
    return { normalizedOriginalUrl: null, originalUrl: null, originalUrlHash: null };
  }
}

/**
 * 启发式获取内容
 * 优先级：content:encoded > content > summary > description
 */
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

/**
 * 核心解析入口
 */
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
        // 保存一份原始数据的 JSON 副本，方便后续调试和排查解析问题
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
