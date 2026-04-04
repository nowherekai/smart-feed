import { createLogger } from "../../utils";
import { AiConfigurationError } from "../errors";
import type { AiProvider } from "../provider";
import type { BasicAnalysis, HeavySummary } from "../schemas";
import type { AiPromptInput } from "../types";

const logger = createLogger("AiClient");

const SUPPORTED_SCHEMA_NAMES = ["basic_analysis", "heavy_summary"] as const;

type SupportedSchemaName = (typeof SUPPORTED_SCHEMA_NAMES)[number];

function isSupportedSchemaName(name: string): name is SupportedSchemaName {
  return (SUPPORTED_SCHEMA_NAMES as readonly string[]).includes(name);
}

function collectCandidatePhrases(input: AiPromptInput): string[] {
  const normalized = `${input.title}\n${input.cleanedMd}`
    .replace(/[#>*_`~-]+/g, " ")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length === 0) {
    return [input.title];
  }

  const phrases = normalized
    .split(/[。！？.!?\n]/u)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= 6);

  return phrases.length > 0 ? phrases : [normalized.slice(0, 160)];
}

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function inferLanguage(text: string): BasicAnalysis["language"] {
  return /[\u4e00-\u9fff]/u.test(text) ? "zh" : "en";
}

function inferCategories(text: string): BasicAnalysis["categories"] {
  const categories = new Set<string>();
  const normalized = text.toLowerCase();

  if (/[aA][iI]|模型|agent|llm|智能/u.test(text)) {
    categories.add("ai");
  }

  if (/database|postgres|sql|drizzle|redis/u.test(normalized)) {
    categories.add("data");
  }

  if (/release|launch|ship|发布|上线|roadmap/u.test(text)) {
    categories.add("product");
  }

  if (/security|漏洞|风控|风险|合规/u.test(text)) {
    categories.add("risk");
  }

  if (categories.size === 0) {
    categories.add("general");
  }

  return Array.from(categories).slice(0, 4);
}

function inferKeywords(text: string): string[] {
  const englishTokens = Array.from(text.toLowerCase().matchAll(/\b[a-z][a-z0-9-]{3,}\b/g), (match) => match[0]);
  const chineseTokens = Array.from(text.matchAll(/[\u4e00-\u9fff]{2,6}/gu), (match) => match[0]);
  const keywords = [...englishTokens, ...chineseTokens]
    .map((token) => token.trim())
    .filter((token, index, list) => list.indexOf(token) === index);

  return keywords.slice(0, 8);
}

function inferEntities(input: AiPromptInput): string[] {
  const entities = new Set<string>([input.sourceName]);

  for (const match of input.cleanedMd.matchAll(/\b[A-Z][A-Za-z0-9-]{2,}\b/g)) {
    entities.add(match[0]);
  }

  return Array.from(entities).slice(0, 6);
}

function inferSentiment(text: string): BasicAnalysis["sentiment"] {
  const positivePattern = /improve|growth|突破|增长|提升|机会/u;
  const negativePattern = /risk|issue|fail|warning|下降|风险|故障/u;
  const hasPositive = positivePattern.test(text);
  const hasNegative = negativePattern.test(text);

  if (hasPositive && hasNegative) {
    return "mixed";
  }

  if (hasPositive) {
    return "positive";
  }

  if (hasNegative) {
    return "negative";
  }

  return "neutral";
}

function inferValueScore(text: string, categories: string[]): number {
  let score = 4;
  const contentLength = text.trim().length;

  if (contentLength > 400) {
    score += 1;
  }

  if (contentLength > 1200) {
    score += 1;
  }

  if (categories.includes("ai") || categories.includes("product")) {
    score += 1;
  }

  if (/analysis|benchmark|总结|复盘|趋势|架构/u.test(text)) {
    score += 1;
  }

  return Math.max(0, Math.min(10, score));
}

function buildDummyBasicAnalysis(input: AiPromptInput): BasicAnalysis {
  const combinedText = `${input.title}\n${input.cleanedMd}`;
  const categories = inferCategories(combinedText);
  const keywords = inferKeywords(combinedText);
  const entities = inferEntities(input);

  return {
    categories,
    entities,
    keywords,
    language: inferLanguage(combinedText),
    sentiment: inferSentiment(combinedText),
    valueScore: inferValueScore(combinedText, categories),
  };
}

function buildDummyHeavySummary(input: AiPromptInput): HeavySummary {
  const phrases = collectCandidatePhrases(input);
  const evidenceSnippet = truncateText(phrases[0] ?? input.title, 180);
  const points = phrases.slice(0, 3).map((phrase) => truncateText(phrase, 90));
  const categories = inferCategories(`${input.title}\n${input.cleanedMd}`);
  const valueScore = inferValueScore(`${input.title}\n${input.cleanedMd}`, categories);

  return {
    evidenceSnippet,
    oneline: truncateText(`${input.sourceName}：${input.title}`, 70),
    points,
    reason: `Dummy provider 认为这篇内容的价值分约为 ${valueScore}/10，适合后续由真实模型接管验证。`,
  };
}

export class DummyProvider implements AiProvider {
  readonly name = "dummy" as const;

  async execute<TOutput>(options: Parameters<AiProvider["execute"]>[0]) {
    const { input, kind, promptDefinition } = options;

    if (!isSupportedSchemaName(promptDefinition.schemaName)) {
      throw new AiConfigurationError(`DummyProvider does not support schema "${promptDefinition.schemaName}"`);
    }

    const rawOutput =
      promptDefinition.schemaName === "basic_analysis" ? buildDummyBasicAnalysis(input) : buildDummyHeavySummary(input);
    const output = promptDefinition.schema.parse(rawOutput) as TOutput;

    logger.info("AI prompt execution completed with dummy provider", {
      kind,
      provider: this.name,
      runtimeState: this.name,
      schemaName: promptDefinition.schemaName,
    });

    return output;
  }
}
