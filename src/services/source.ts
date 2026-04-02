/**
 * 信息源业务逻辑模块
 * 负责信息源（Source）的验证、元数据提取、数据库查询及创建操作。
 */

import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { XMLParser } from "fast-xml-parser";

import { getDb, sources } from "../db";
import { normalizeUrl } from "../utils";

/** 快速 XML 解析器配置，用于提取 Feed 元数据 */
const feedParser = new XMLParser({
  attributeNamePrefix: "",
  ignoreAttributes: false,
  parseTagValue: false,
  processEntities: false,
  trimValues: true,
});

/** 抓取时使用的 User-Agent */
const SMART_FEED_USER_AGENT = "smart-feed/1.0 (+https://github.com/nowherekai/smart-feed)";

/** Feed 元数据子集 */
type FeedMetadata = {
  /** 频道标题 */
  title: string | null;
  /** 站点主页链接 */
  siteUrl: string | null;
};

type SourceRecord = typeof sources.$inferSelect;
type NewSource = typeof sources.$inferInsert;

export type SourceType = (typeof sources.$inferInsert)["type"];

/** 已验证并准备好的 RSS 来源信息 */
export type PreparedRssSource = {
  /** 规范化后的 RSS 地址 */
  normalizedUrl: string;
  /** 来源标题 */
  title: string | null;
  /** 站点主页链接 */
  siteUrl: string | null;
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** 验证依赖项 */
export type VerifyRssSourceDeps = {
  fetch?: FetchLike;
};

/** 辅助函数：规范化可选字符串 */
function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** 仅解码 XML 5 个内置实体，避免依赖通用实体展开。 */
function decodeBasicXmlEntities(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function normalizeOptionalXmlText(value: unknown): string | null {
  const normalized = normalizeOptionalString(value);
  return normalized ? decodeBasicXmlEntities(normalized) : null;
}

/**
 * 从原始 XML 中提取 Feed 元数据 (标题、站点链接)
 * 支持 RSS 2.0, Atom 1.0, 和 RDF/RSS 1.0
 */
function extractFeedMetadata(xml: string): FeedMetadata {
  const parsed = feedParser.parse(xml) as {
    rss?: { channel?: { title?: string; link?: string } };
    feed?: {
      title?: string | { "#text"?: string };
      link?: { href?: string; rel?: string } | Array<{ href?: string; rel?: string }>;
    };
    "rdf:RDF"?: { channel?: { title?: string; link?: string } };
  };

  // 处理 RSS 2.0 或 RDF 1.0
  const rssChannel = parsed.rss?.channel ?? parsed["rdf:RDF"]?.channel;

  if (rssChannel) {
    return {
      title: normalizeOptionalXmlText(rssChannel.title),
      siteUrl: normalizeOptionalXmlText(rssChannel.link),
    };
  }

  // 处理 Atom 1.0
  const atomFeed = parsed.feed;

  if (atomFeed) {
    const links = Array.isArray(atomFeed.link) ? atomFeed.link : atomFeed.link ? [atomFeed.link] : [];
    const alternateLink = links.find((link) => !link.rel || link.rel === "alternate") ?? links[0];

    return {
      title:
        typeof atomFeed.title === "string"
          ? normalizeOptionalXmlText(atomFeed.title)
          : normalizeOptionalXmlText(atomFeed.title?.["#text"]),
      siteUrl: normalizeOptionalXmlText(alternateLink?.href),
    };
  }

  throw new Error("[services/source] Response is not a valid RSS or Atom feed.");
}

/**
 * 校验并规范化 HTTP/HTTPS URL
 */
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

/**
 * 核心验证函数：尝试抓取并解析 RSS 地址
 * 1. 规范化 URL。
 * 2. 尝试 Fetch 抓取。
 * 3. 校验状态码。
 * 4. 提取元数据。
 */
export async function verifyAndPrepareRssSource(
  inputUrl: string,
  deps: VerifyRssSourceDeps = {},
): Promise<PreparedRssSource> {
  const normalizedUrl = assertHttpUrl(inputUrl);
  const fetchImpl = deps.fetch ?? fetch;
  const response = await fetchImpl(normalizedUrl, {
    headers: {
      "user-agent": SMART_FEED_USER_AGENT,
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(10_000), // 10秒超时
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

/**
 * 根据标识符 (URL) 和类型查找信息源
 */
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

/**
 * 创建新的信息源记录
 */
export async function createSource(data: NewSource): Promise<SourceRecord> {
  const db = getDb();
  const [source] = await db.insert(sources).values(data).returning();

  return requireInsertedSource(source);
}

/**
 * 获取所有活跃信息源的 ID 列表
 */
export async function listActiveSourceIds(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: sources.id,
    })
    .from(sources)
    .where(eq(sources.status, "active"));

  return rows.map((row) => row.id);
}

/**
 * 获取当前调度周期内需要同步的活跃来源 ID 列表
 * 基于最近一次成功同步时间做门控，失败重试不受 lastPolledAt 影响。
 */
export async function listSourceIdsDueForSync(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: sources.id,
    })
    .from(sources)
    .where(
      and(
        eq(sources.status, "active"),
        or(isNull(sources.lastSuccessfulSyncAt), lt(sources.lastSuccessfulSyncAt, sql`NOW() - INTERVAL '1 hour'`)),
      ),
    );

  return rows.map((row) => row.id);
}

export type { NewSource, SourceRecord };
