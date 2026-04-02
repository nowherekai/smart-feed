/**
 * 内容标准化转换服务模块
 * 负责将原始 HTML 或纯文本转换为清洗后的标准 Markdown 格式。
 * 包含：噪音节点移除（导航、广告、页脚）、正文根节点启发式识别、Markdown 格式化、标题补全及长度截断。
 */

import { DOMParser } from "linkedom";
import TurndownService from "turndown";

import { logger, sanitizeUrlForLogging } from "../utils";
import type { RawContentFormat } from "./html-fetcher";

/** 最终 Markdown 的最大字节数限制，防止 AI 处理成本过高 */
const MAX_MARKDOWN_BYTES = 50 * 1024;

/** 需要移除的常见噪音元素选择器 */
const NOISE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "nav",
  "footer",
  "aside",
  "form",
  "dialog",
  "button",
  "[role='navigation']",
  "[role='complementary']",
  "[aria-hidden='true']",
  ".ad",
  ".ads",
  ".advert",
  ".advertisement",
  ".banner",
  ".breadcrumbs",
  ".comment",
  ".comments",
  ".footer",
  ".header",
  ".menu",
  ".nav",
  ".newsletter",
  ".pagination",
  ".promo",
  ".recommend",
  ".recommended",
  ".related",
  ".share",
  ".sharing",
  ".sidebar",
  ".social",
  ".subscribe",
];

/** 潜在的正文根节点选择器，按优先级排序 */
const CONTENT_ROOT_SELECTORS = [
  "article",
  "main",
  "[role='main']",
  ".article-content",
  ".article__content",
  ".content",
  ".entry-content",
  ".post-content",
  ".post__content",
];

/** 初始化 Turndown 转换服务 */
const turndownService = new TurndownService({
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  headingStyle: "atx",
});

/** 自定义规则：确保 figure 标签内的图片保留空行 */
turndownService.addRule("figure-images", {
  filter(node) {
    return node.nodeName === "FIGURE";
  },
  replacement(content) {
    return `${content}\n\n`;
  },
});

export type NormalizeRawContentInput = {
  format: RawContentFormat;
  originalUrl: string;
  rawBody: string;
  title: string | null;
};

export type NormalizeRawContentResult = {
  markdown: string;
  truncated: boolean;
};

// 内部类型定义
type QueryableNode = {
  querySelectorAll(selector: string): Iterable<unknown>;
};

type ContentElement = QueryableNode & {
  cloneNode(deep?: boolean): unknown;
  innerHTML: string;
  textContent: string | null;
};

type RemovableNode = {
  remove(): void;
};

type ParsedHtmlDocument = QueryableNode & {
  body: ContentElement;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n");
}

function getTextLength(element: ContentElement): number {
  return element.textContent?.replace(/\s+/g, " ").trim().length ?? 0;
}

/** 移除选中的噪音节点 */
function removeNoise(root: QueryableNode): void {
  for (const selector of NOISE_SELECTORS) {
    for (const node of root.querySelectorAll(selector) as Iterable<RemovableNode>) {
      node.remove();
    }
  }
}

/**
 * 启发式选择最佳正文根节点
 * 1. 尝试匹配常见的正文容器选择器。
 * 2. 在匹配到的容器中，选择纯文本内容最长的那个作为最终根节点。
 * 3. 若无匹配，回退到 body 节点。
 */
function pickBestContentRoot(document: ParsedHtmlDocument): ContentElement {
  const candidates = CONTENT_ROOT_SELECTORS.flatMap((selector) => [
    ...(document.querySelectorAll(selector) as Iterable<ContentElement>),
  ]);

  if (candidates.length === 0) {
    return document.body;
  }

  let bestCandidate: ContentElement | null = null;
  let bestLength = -1;

  for (const candidate of candidates) {
    const length = getTextLength(candidate);

    if (length > bestLength) {
      bestCandidate = candidate;
      bestLength = length;
    }
  }

  return bestCandidate ?? document.body;
}

/** 在正文头部补齐一级标题（若没有） */
function prependTitle(markdown: string, title: string | null): string {
  if (!title) {
    return markdown;
  }

  const trimmedTitle = title.trim();

  if (!trimmedTitle) {
    return markdown;
  }

  const normalizedMarkdown = markdown.trimStart();

  if (normalizedMarkdown.startsWith(`# ${trimmedTitle}`)) {
    return markdown;
  }

  return `# ${trimmedTitle}\n\n${markdown}`;
}

/** 在尾部补齐原文链接 */
function appendSourceLink(markdown: string, originalUrl: string): string {
  if (!originalUrl.trim()) {
    return markdown;
  }

  if (markdown.includes(originalUrl)) {
    return markdown;
  }

  return `${markdown}\n\nSource: ${originalUrl}`;
}

/** 格式清理：移除多余空行和行尾空格 */
function cleanMarkdown(markdown: string): string {
  return normalizeWhitespace(markdown)
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

/**
 * 内容截断逻辑
 * 优先按段落截断，确保 Markdown 字节大小在限制范围内。
 */
function truncateMarkdown(markdown: string): NormalizeRawContentResult {
  const encoder = new TextEncoder();

  if (encoder.encode(markdown).length <= MAX_MARKDOWN_BYTES) {
    return {
      markdown,
      truncated: false,
    };
  }

  const paragraphs = markdown.split(/\n{2,}/);
  const kept: string[] = [];
  const suffix = "\n\n[内容过长，已截断]";
  const suffixBytes = encoder.encode(suffix).length;

  for (const paragraph of paragraphs) {
    const nextMarkdown = kept.length === 0 ? paragraph : `${kept.join("\n\n")}\n\n${paragraph}`;

    if (encoder.encode(`${nextMarkdown}${suffix}`).length > MAX_MARKDOWN_BYTES) {
      break;
    }

    kept.push(paragraph);
  }

  if (kept.length > 0) {
    return {
      markdown: `${kept.join("\n\n")}${suffix}`,
      truncated: true,
    };
  }

  // 极端情况：单段落也超长，则按字符截断
  let fallbackMarkdown = "";

  for (const character of markdown) {
    const nextMarkdown = `${fallbackMarkdown}${character}`;

    if (encoder.encode(nextMarkdown).length + suffixBytes > MAX_MARKDOWN_BYTES) {
      break;
    }

    fallbackMarkdown = nextMarkdown;
  }

  return {
    markdown: `${fallbackMarkdown}${suffix}`,
    truncated: true,
  };
}

/** 处理 HTML 格式内容 */
function normalizeHtmlToMarkdown(input: NormalizeRawContentInput): string {
  const document = new DOMParser().parseFromString(input.rawBody, "text/html") as unknown as ParsedHtmlDocument;

  // 1. 初步移除全局噪音
  removeNoise(document);

  // 2. 识别正文根节点
  const contentRoot = pickBestContentRoot(document).cloneNode(true) as ContentElement;

  if (!contentRoot.innerHTML) {
    throw new Error("[services/normalizer] Failed to identify content root.");
  }

  // 3. 对正文根节点再次深度清理
  removeNoise(contentRoot);

  // 4. HTML 转 Markdown
  const markdown = turndownService.turndown(contentRoot.innerHTML);

  return appendSourceLink(prependTitle(markdown, input.title), input.originalUrl);
}

/** 处理纯文本内容 */
function normalizePlainTextToMarkdown(input: NormalizeRawContentInput): string {
  const paragraphs = normalizeWhitespace(input.rawBody)
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  const body = paragraphs.join("\n\n");
  return appendSourceLink(prependTitle(body, input.title), input.originalUrl);
}

/**
 * 标准化入口函数 (Task 3)
 * 1. 识别内容格式（HTML 或纯文本）。
 * 2. 执行相应的清洗和转换流程。
 * 3. 进行最终的格式美化和长度截断。
 */
export function normalizeRawContent(input: NormalizeRawContentInput): NormalizeRawContentResult {
  const rawBody = input.rawBody.trim();
  const safeUrlToLog = sanitizeUrlForLogging(input.originalUrl);

  logger.info("Normalizing raw content", {
    format: input.format,
    url: safeUrlToLog,
    rawLength: rawBody.length,
  });

  if (!rawBody) {
    const errorMsg = "[services/normalizer] rawBody is empty.";
    logger.error(errorMsg, { url: safeUrlToLog });
    throw new Error(errorMsg);
  }

  try {
    const isActuallyHtml = input.format === "html" || looksLikeHtml(rawBody);

    const markdown = isActuallyHtml ? normalizeHtmlToMarkdown(input) : normalizePlainTextToMarkdown(input);

    const result = truncateMarkdown(cleanMarkdown(markdown));

    logger.info("Content normalization completed", {
      url: safeUrlToLog,
      detectedAsHtml: isActuallyHtml,
      finalLength: result.markdown.length,
      truncated: result.truncated,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown normalization error";
    logger.error("Content normalization failed", { error: errorMessage, url: safeUrlToLog });
    throw error;
  }
}

/** 辅助函数：判断是否像 HTML */
function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}
