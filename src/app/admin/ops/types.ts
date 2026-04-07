export const OPS_RANGES = ["day", "week", "month", "all"] as const;

export type OpsRange = (typeof OPS_RANGES)[number];
export type OpsRunType = "pipeline" | "step";

export type OpsSearchParams = {
  range?: string | string[] | undefined;
};

export type OpsOverview = {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  runningRuns: number;
  pendingRuns: number;
  successRate: number | null;
  failureRate: number | null;
  avgDurationMs: number | null;
  p95DurationMs: number | null;
};

export type OpsPipelineMetric = {
  pipelineName: string;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  runningRuns: number;
  successRate: number | null;
  failureRate: number | null;
  avgDurationMs: number | null;
  p95DurationMs: number | null;
};

export type OpsStepMetric = {
  pipelineName: string;
  stepName: string;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  runningRuns: number;
  successRate: number | null;
  failureRate: number | null;
  avgDurationMs: number | null;
  p95DurationMs: number | null;
};

export type OpsFailureItem = {
  runType: OpsRunType;
  pipelineRunId: string;
  stepRunId: string | null;
  pipelineName: string;
  stepName: string | null;
  contentId: string | null;
  digestId: string | null;
  errorMessage: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  durationMs: number | null;
  failureAt: Date;
};

export type OpsInsightsPageData = {
  selectedRange: OpsRange;
  timeZone: string;
  rangeLabel: string;
  bullBoardUrl: string;
  overview: OpsOverview;
  pipelineBreakdown: OpsPipelineMetric[];
  stepBreakdown: OpsStepMetric[];
  recentFailures: OpsFailureItem[];
};
