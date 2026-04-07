export const STATS_RANGES = ["day", "week", "month", "all"] as const;

export type StatsRange = (typeof STATS_RANGES)[number];
export type StatsBucketGranularity = "hour" | "day" | "month";

export type StatsSearchParams = {
  range?: string | string[] | undefined;
};

export type StatsOverview = {
  totalContents: number;
  normalizedContents: number;
  analyzedContents: number;
  digestedContents: number;
  highValueContents: number;
  highValueRatio: number | null;
  activeSources: number;
  totalSources: number;
  missingAnalyzedRecords: number;
};

export type StatsFunnelStep = {
  key: "total" | "normalized" | "analyzed" | "digested";
  label: string;
  count: number;
  ratio: number | null;
};

export type StatsTrendPoint = {
  bucketKey: string;
  bucketLabel: string;
  contentCount: number;
  analyzedCount: number;
};

export type StatsTopSource = {
  sourceId: string;
  sourceName: string;
  itemCount: number;
};

export type StatsPageData = {
  selectedRange: StatsRange;
  timeZone: string;
  rangeLabel: string;
  bucketGranularity: StatsBucketGranularity;
  windowStart: Date | null;
  windowEnd: Date;
  overview: StatsOverview;
  funnel: StatsFunnelStep[];
  trends: StatsTrendPoint[];
  topSources: StatsTopSource[];
};
