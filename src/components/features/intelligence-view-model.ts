import type { AnalysisRecord, AnalysisSummary } from "@/db/schema";

type RequiredSummary = AnalysisSummary;

type BaseSummaryRecord = {
  id: string;
  summary: RequiredSummary;
  sourceName: string;
  originalUrl: string;
};

export type IntelligenceCardRecord = BaseSummaryRecord & {
  categories: string[];
  valueScore: number;
};

export type DigestItemRecord = BaseSummaryRecord;

function hasSummary(summary: AnalysisRecord["summary"]): summary is RequiredSummary {
  return summary !== null;
}

export function toIntelligenceCardRecord(record: AnalysisRecord): IntelligenceCardRecord | null {
  if (!hasSummary(record.summary)) {
    return null;
  }

  return {
    id: record.id,
    summary: record.summary,
    sourceName: record.sourceName,
    originalUrl: record.originalUrl,
    categories: record.categories ?? [],
    valueScore: record.valueScore,
  };
}

export function toDigestItemRecord(record: AnalysisRecord): DigestItemRecord | null {
  if (!hasSummary(record.summary)) {
    return null;
  }

  return {
    id: record.id,
    summary: record.summary,
    sourceName: record.sourceName,
    originalUrl: record.originalUrl,
  };
}
