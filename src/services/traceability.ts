type DigestEligibleRecord = {
  contentTraceId?: string | null;
  evidenceSnippet?: string | null;
  originalUrl?: string | null;
  sourceName?: string | null;
  sourceTraceId?: string | null;
};

export function canEnterDigest(record: DigestEligibleRecord): boolean {
  return Boolean(
    record.sourceTraceId && record.sourceName && record.contentTraceId && record.originalUrl && record.evidenceSnippet,
  );
}

export type { DigestEligibleRecord };
