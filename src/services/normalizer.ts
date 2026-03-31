import { DOMParser } from "linkedom";
import TurndownService from "turndown";

import type { RawContentFormat } from "./html-fetcher";

const MAX_MARKDOWN_BYTES = 50 * 1024;

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

const turndownService = new TurndownService({
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  headingStyle: "atx",
});

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

function removeNoise(root: QueryableNode): void {
  for (const selector of NOISE_SELECTORS) {
    for (const node of root.querySelectorAll(selector) as Iterable<RemovableNode>) {
      node.remove();
    }
  }
}

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

function appendSourceLink(markdown: string, originalUrl: string): string {
  if (!originalUrl.trim()) {
    return markdown;
  }

  if (markdown.includes(originalUrl)) {
    return markdown;
  }

  return `${markdown}\n\nSource: ${originalUrl}`;
}

function cleanMarkdown(markdown: string): string {
  return normalizeWhitespace(markdown)
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

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

function normalizeHtmlToMarkdown(input: NormalizeRawContentInput): string {
  const document = new DOMParser().parseFromString(input.rawBody, "text/html") as unknown as ParsedHtmlDocument;
  removeNoise(document);

  const contentRoot = pickBestContentRoot(document).cloneNode(true) as ContentElement;

  if (!contentRoot.innerHTML) {
    throw new Error("[services/normalizer] Failed to identify content root.");
  }

  removeNoise(contentRoot);
  const markdown = turndownService.turndown(contentRoot.innerHTML);

  return appendSourceLink(prependTitle(markdown, input.title), input.originalUrl);
}

function normalizePlainTextToMarkdown(input: NormalizeRawContentInput): string {
  const paragraphs = normalizeWhitespace(input.rawBody)
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  const body = paragraphs.join("\n\n");
  return appendSourceLink(prependTitle(body, input.title), input.originalUrl);
}

export function normalizeRawContent(input: NormalizeRawContentInput): NormalizeRawContentResult {
  const rawBody = input.rawBody.trim();

  if (!rawBody) {
    throw new Error("[services/normalizer] rawBody is empty.");
  }

  const markdown =
    input.format === "html" || /<\/?[a-z][\s\S]*>/i.test(rawBody)
      ? normalizeHtmlToMarkdown(input)
      : normalizePlainTextToMarkdown(input);

  return truncateMarkdown(cleanMarkdown(markdown));
}
