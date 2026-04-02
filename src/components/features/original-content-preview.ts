const HTML_TAG_PATTERN = /<[^>]+>/g;
const HTML_PATTERN = /<\/?[a-z][\s\S]*>/i;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripHtmlTags(value: string): string {
  return normalizeWhitespace(value.replace(HTML_TAG_PATTERN, " "));
}

export function looksLikeHtml(value: string): boolean {
  return HTML_PATTERN.test(value);
}

export function createOriginalContentPreview(
  input: {
    rawBody: string;
    rawExcerpt?: string | null;
  },
  maxLength = 280,
): string {
  const rawSource = input.rawExcerpt?.trim() ? input.rawExcerpt : input.rawBody;
  const trimmedSource = rawSource.trim();

  if (!trimmedSource) {
    return "";
  }

  const normalized = looksLikeHtml(trimmedSource) ? stripHtmlTags(trimmedSource) : normalizeWhitespace(trimmedSource);

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}…`;
}
