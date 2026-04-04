import type { BasicAnalysis, HeavySummary } from "../schemas";

type JsonRecord = Record<string, unknown>;

export function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getFirstDefinedValue(record: JsonRecord, aliases: readonly string[]): unknown {
  for (const alias of aliases) {
    if (Object.hasOwn(record, alias)) {
      return record[alias];
    }
  }

  return undefined;
}

export function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function normalizeStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const normalized = value.map((item) => normalizeString(item)).filter((item): item is string => item !== undefined);

    return normalized.length > 0 ? normalized : undefined;
  }

  const singleValue = normalizeString(value);

  if (singleValue === undefined) {
    return undefined;
  }

  const normalized = singleValue
    .split(/[\n,，、;；]+/u)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return normalized.length > 0 ? normalized : undefined;
}

export function normalizePoints(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const normalized = value.map((item) => normalizeString(item)).filter((item): item is string => item !== undefined);

    return normalized.length > 0 ? normalized.slice(0, 3) : undefined;
  }

  const singleValue = normalizeString(value);

  if (singleValue === undefined) {
    return undefined;
  }

  const normalized = singleValue
    .split(/\n+|^[-*•]\s*|[；;]+/mu)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return normalized.length > 0 ? normalized.slice(0, 3) : undefined;
}

export function normalizeLanguage(value: unknown): string | undefined {
  const normalized = normalizeString(value)?.toLowerCase();

  if (normalized === undefined) {
    return undefined;
  }

  if (
    normalized === "zh" ||
    normalized === "zh-cn" ||
    normalized === "zh_hans" ||
    normalized === "cn" ||
    normalized.includes("中文") ||
    normalized.includes("汉语") ||
    normalized.includes("chinese")
  ) {
    return "zh";
  }

  if (
    normalized === "en" ||
    normalized === "en-us" ||
    normalized.includes("英文") ||
    normalized.includes("英语") ||
    normalized.includes("english")
  ) {
    return "en";
  }

  return normalized;
}

export function normalizeSentiment(value: unknown): BasicAnalysis["sentiment"] | undefined {
  const normalized = normalizeString(value)?.toLowerCase();

  if (normalized === undefined) {
    return undefined;
  }

  if (normalized === "positive" || normalized.includes("积极") || normalized.includes("正面")) {
    return "positive";
  }

  if (normalized === "neutral" || normalized.includes("中性") || normalized.includes("客观")) {
    return "neutral";
  }

  if (normalized === "negative" || normalized.includes("消极") || normalized.includes("负面")) {
    return "negative";
  }

  if (normalized === "mixed" || normalized.includes("混合") || normalized.includes("复杂")) {
    return "mixed";
  }

  return undefined;
}

export function normalizeValueScoreNumber(value: number): number | undefined {
  if (!Number.isFinite(value)) {
    return undefined;
  }

  let normalized = value;

  if (normalized >= 0 && normalized <= 1) {
    normalized *= 10;
  } else if (normalized > 10 && normalized <= 100) {
    normalized /= 10;
  }

  const rounded = Math.round(normalized);

  if (rounded < 0 || rounded > 10) {
    return undefined;
  }

  return rounded;
}

export function normalizeValueScore(value: unknown): number | undefined {
  if (typeof value === "number") {
    return normalizeValueScoreNumber(value);
  }

  const normalized = normalizeString(value);

  if (normalized === undefined) {
    return undefined;
  }

  const outOfTenMatch = normalized.match(/-?\d+(?:\.\d+)?(?=\s*\/\s*10)/u);

  if (outOfTenMatch?.[0] !== undefined) {
    return normalizeValueScoreNumber(Number.parseFloat(outOfTenMatch[0]));
  }

  const numericMatch = normalized.match(/-?\d+(?:\.\d+)?/u);

  if (numericMatch?.[0] !== undefined) {
    return normalizeValueScoreNumber(Number.parseFloat(numericMatch[0]));
  }

  return undefined;
}

export function normalizeBasicAnalysisCandidate(value: unknown): Partial<BasicAnalysis> | null {
  if (!isJsonRecord(value)) {
    return null;
  }

  return {
    categories: normalizeStringArray(getFirstDefinedValue(value, ["categories", "分类"])),
    keywords: normalizeStringArray(getFirstDefinedValue(value, ["keywords", "关键词"])),
    entities: normalizeStringArray(getFirstDefinedValue(value, ["entities", "实体"])),
    language: normalizeLanguage(getFirstDefinedValue(value, ["language", "语言"])),
    sentiment: normalizeSentiment(getFirstDefinedValue(value, ["sentiment", "情绪"])),
    valueScore: normalizeValueScore(getFirstDefinedValue(value, ["valueScore", "价值分"])),
  };
}

export function normalizeHeavySummaryCandidate(value: unknown): Partial<HeavySummary> | null {
  if (!isJsonRecord(value)) {
    return null;
  }

  return {
    oneline: normalizeString(getFirstDefinedValue(value, ["oneline", "一句话总结", "单行总结", "总结"])),
    points: normalizePoints(getFirstDefinedValue(value, ["points", "要点", "关键要点", "要点列表"])),
    reason: normalizeString(getFirstDefinedValue(value, ["reason", "关注理由", "推荐理由", "理由"])),
    evidenceSnippet: normalizeString(getFirstDefinedValue(value, ["evidenceSnippet", "证据片段", "证据", "引用片段"])),
  };
}

export function buildRepairedObject(schemaName: string, value: unknown): JsonRecord | null {
  if (schemaName === "basic_analysis") {
    return normalizeBasicAnalysisCandidate(value) as JsonRecord | null;
  }

  if (schemaName === "heavy_summary") {
    return normalizeHeavySummaryCandidate(value) as JsonRecord | null;
  }

  return null;
}
