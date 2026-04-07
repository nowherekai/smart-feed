import { type SQL, sql } from "drizzle-orm";
import type {
  OpsFailureItem,
  OpsInsightsPageData,
  OpsOverview,
  OpsPipelineMetric,
  OpsRange,
  OpsRunType,
  OpsSearchParams,
  OpsStepMetric,
} from "@/app/admin/ops/types";
import { getAppEnv } from "@/config";
import { db } from "@/db";
import { createLogger } from "@/utils/logger";
import { getStartOfZonedDay, getStartOfZonedMonth, getStartOfZonedWeek } from "@/utils/time";
import { getWorkerEnv } from "@/workers/env";

const logger = createLogger("OpsInsightsQuery");
const BULL_BOARD_BASE_PATH = "/admin/queues";
const PIPELINE_FAILURE_FALLBACK_MESSAGE = "Pipeline run failed without step-level error message.";

type OpsRangeWindow = {
  range: OpsRange;
  timeZone: string;
  label: string;
  windowStart: Date | null;
  windowEnd: Date;
};

type OpsOverviewAggregateRow = {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  runningRuns: number;
  pendingRuns: number;
  avgDurationMs: number | null;
  p95DurationMs: number | null;
};

type OpsPipelineAggregateRow = {
  pipelineName: string;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  runningRuns: number;
  avgDurationMs: number | null;
  p95DurationMs: number | null;
};

type OpsStepAggregateRow = {
  pipelineName: string;
  stepName: string;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  runningRuns: number;
  avgDurationMs: number | null;
  p95DurationMs: number | null;
};

type OpsFailureAggregateRow = {
  runType: OpsRunType;
  pipelineRunId: string;
  stepRunId: string | null;
  pipelineName: string;
  stepName: string | null;
  contentId: string | null;
  digestId: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  durationMs: number | null;
  failureAt: Date;
};

type OpsInsightsQueryDeps = {
  fetchOverview: (window: OpsRangeWindow) => Promise<OpsOverviewAggregateRow>;
  fetchPipelineBreakdown: (window: OpsRangeWindow) => Promise<OpsPipelineAggregateRow[]>;
  fetchStepBreakdown: (window: OpsRangeWindow) => Promise<OpsStepAggregateRow[]>;
  fetchRecentFailures: (window: OpsRangeWindow) => Promise<OpsFailureAggregateRow[]>;
  getBullBoardUrl: () => string;
};

function getFirstSearchParamValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return null;
}

export function normalizeOpsParams(input: OpsSearchParams): { range: OpsRange } {
  const rawRange = getFirstSearchParamValue(input.range);

  if (rawRange === "day" || rawRange === "week" || rawRange === "month" || rawRange === "all") {
    return { range: rawRange };
  }

  return { range: "week" };
}

function formatZonedDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    month: "numeric",
    day: "numeric",
  }).format(date);
}

export function getOpsRangeWindow(range: OpsRange, now = new Date(), timeZone = getAppEnv().timeZone): OpsRangeWindow {
  if (range === "day") {
    const windowStart = getStartOfZonedDay(now, timeZone);

    return {
      range,
      timeZone,
      label: `今日（${formatZonedDate(now, timeZone)}）`,
      windowStart,
      windowEnd: now,
    };
  }

  if (range === "month") {
    const windowStart = getStartOfZonedMonth(now, timeZone);

    return {
      range,
      timeZone,
      label: "本月",
      windowStart,
      windowEnd: now,
    };
  }

  if (range === "all") {
    return {
      range,
      timeZone,
      label: "全部范围",
      windowStart: null,
      windowEnd: now,
    };
  }

  const windowStart = getStartOfZonedWeek(now, timeZone);

  return {
    range,
    timeZone,
    label: "本周",
    windowStart,
    windowEnd: now,
  };
}

function getRunWindowFilter(startedColumn: SQL<unknown>, fallbackColumn: SQL<unknown>, window: OpsRangeWindow) {
  if (window.windowStart) {
    return sql`(
      (${startedColumn} IS NOT NULL AND ${startedColumn} >= ${window.windowStart.toISOString()} AND ${startedColumn} < ${window.windowEnd.toISOString()})
      OR
      (${startedColumn} IS NULL AND ${fallbackColumn} >= ${window.windowStart.toISOString()} AND ${fallbackColumn} < ${window.windowEnd.toISOString()})
    )`;
  }

  return sql`(
    (${startedColumn} IS NOT NULL AND ${startedColumn} < ${window.windowEnd.toISOString()})
    OR
    (${startedColumn} IS NULL AND ${fallbackColumn} < ${window.windowEnd.toISOString()})
  )`;
}

function parseCount(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

function parseNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return Number(value);
}

function calculateSuccessRate(completedRuns: number, failedRuns: number): number | null {
  const terminalRuns = completedRuns + failedRuns;
  return terminalRuns > 0 ? completedRuns / terminalRuns : null;
}

function calculateFailureRate(completedRuns: number, failedRuns: number): number | null {
  const terminalRuns = completedRuns + failedRuns;
  return terminalRuns > 0 ? failedRuns / terminalRuns : null;
}

function buildOverview(row: OpsOverviewAggregateRow): OpsOverview {
  return {
    totalRuns: row.totalRuns,
    completedRuns: row.completedRuns,
    failedRuns: row.failedRuns,
    runningRuns: row.runningRuns,
    pendingRuns: row.pendingRuns,
    successRate: calculateSuccessRate(row.completedRuns, row.failedRuns),
    failureRate: calculateFailureRate(row.completedRuns, row.failedRuns),
    avgDurationMs: row.avgDurationMs,
    p95DurationMs: row.p95DurationMs,
  };
}

function buildPipelineMetric(row: OpsPipelineAggregateRow): OpsPipelineMetric {
  return {
    pipelineName: row.pipelineName,
    totalRuns: row.totalRuns,
    completedRuns: row.completedRuns,
    failedRuns: row.failedRuns,
    runningRuns: row.runningRuns,
    successRate: calculateSuccessRate(row.completedRuns, row.failedRuns),
    failureRate: calculateFailureRate(row.completedRuns, row.failedRuns),
    avgDurationMs: row.avgDurationMs,
    p95DurationMs: row.p95DurationMs,
  };
}

function buildStepMetric(row: OpsStepAggregateRow): OpsStepMetric {
  return {
    pipelineName: row.pipelineName,
    stepName: row.stepName,
    totalRuns: row.totalRuns,
    completedRuns: row.completedRuns,
    failedRuns: row.failedRuns,
    runningRuns: row.runningRuns,
    successRate: calculateSuccessRate(row.completedRuns, row.failedRuns),
    failureRate: calculateFailureRate(row.completedRuns, row.failedRuns),
    avgDurationMs: row.avgDurationMs,
    p95DurationMs: row.p95DurationMs,
  };
}

function buildFailureItem(row: OpsFailureAggregateRow): OpsFailureItem {
  return {
    runType: row.runType,
    pipelineRunId: row.pipelineRunId,
    stepRunId: row.stepRunId,
    pipelineName: row.pipelineName,
    stepName: row.stepName,
    contentId: row.contentId,
    digestId: row.digestId,
    errorMessage: row.errorMessage?.trim() || PIPELINE_FAILURE_FALLBACK_MESSAGE,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    durationMs: row.durationMs,
    failureAt: row.failureAt,
  };
}

function getBullBoardUrl(): string {
  const workerEnv = getWorkerEnv();
  return `http://${workerEnv.bullBoardHost}:${workerEnv.bullBoardPort}${BULL_BOARD_BASE_PATH}`;
}

function createOpsInsightsQueryDeps(): OpsInsightsQueryDeps {
  return {
    async fetchOverview(window) {
      const result = await db.execute<{
        avg_duration_ms: number | string | null;
        completed_runs: number | string;
        failed_runs: number | string;
        p95_duration_ms: number | string | null;
        pending_runs: number | string;
        running_runs: number | string;
        total_runs: number | string;
      }>(sql`
        WITH filtered_pipeline_runs AS (
          SELECT
            status,
            CASE
              WHEN status IN ('completed', 'failed')
                AND started_at IS NOT NULL
                AND finished_at IS NOT NULL
              THEN GREATEST(EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000, 0)
              ELSE NULL
            END AS duration_ms
          FROM pipeline_runs
          WHERE ${getRunWindowFilter(sql`started_at`, sql`created_at`, window)}
        )
        SELECT
          COUNT(*)::int AS total_runs,
          COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_runs,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_runs,
          COUNT(*) FILTER (WHERE status = 'running')::int AS running_runs,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_runs,
          AVG(duration_ms) AS avg_duration_ms,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)
            FILTER (WHERE duration_ms IS NOT NULL) AS p95_duration_ms
        FROM filtered_pipeline_runs
      `);
      const row = result[0];

      return {
        totalRuns: parseCount(row?.total_runs),
        completedRuns: parseCount(row?.completed_runs),
        failedRuns: parseCount(row?.failed_runs),
        runningRuns: parseCount(row?.running_runs),
        pendingRuns: parseCount(row?.pending_runs),
        avgDurationMs: parseNullableNumber(row?.avg_duration_ms),
        p95DurationMs: parseNullableNumber(row?.p95_duration_ms),
      };
    },
    async fetchPipelineBreakdown(window) {
      const result = await db.execute<{
        avg_duration_ms: number | string | null;
        completed_runs: number | string;
        failed_runs: number | string;
        p95_duration_ms: number | string | null;
        pipeline_name: string;
        running_runs: number | string;
        total_runs: number | string;
      }>(sql`
        WITH filtered_pipeline_runs AS (
          SELECT
            pipeline_name,
            status,
            CASE
              WHEN status IN ('completed', 'failed')
                AND started_at IS NOT NULL
                AND finished_at IS NOT NULL
              THEN GREATEST(EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000, 0)
              ELSE NULL
            END AS duration_ms
          FROM pipeline_runs
          WHERE ${getRunWindowFilter(sql`started_at`, sql`created_at`, window)}
        )
        SELECT
          pipeline_name,
          COUNT(*)::int AS total_runs,
          COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_runs,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_runs,
          COUNT(*) FILTER (WHERE status = 'running')::int AS running_runs,
          AVG(duration_ms) AS avg_duration_ms,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)
            FILTER (WHERE duration_ms IS NOT NULL) AS p95_duration_ms
        FROM filtered_pipeline_runs
        GROUP BY pipeline_name
        ORDER BY failed_runs DESC, total_runs DESC, pipeline_name ASC
      `);

      return Array.from(result).map((row) => ({
        pipelineName: row.pipeline_name,
        totalRuns: parseCount(row.total_runs),
        completedRuns: parseCount(row.completed_runs),
        failedRuns: parseCount(row.failed_runs),
        runningRuns: parseCount(row.running_runs),
        avgDurationMs: parseNullableNumber(row.avg_duration_ms),
        p95DurationMs: parseNullableNumber(row.p95_duration_ms),
      }));
    },
    async fetchStepBreakdown(window) {
      const result = await db.execute<{
        avg_duration_ms: number | string | null;
        completed_runs: number | string;
        failed_runs: number | string;
        p95_duration_ms: number | string | null;
        pipeline_name: string;
        running_runs: number | string;
        step_name: string;
        total_runs: number | string;
      }>(sql`
        WITH filtered_step_runs AS (
          SELECT
            pr.pipeline_name,
            sr.step_name,
            sr.status,
            CASE
              WHEN sr.status IN ('completed', 'failed')
                AND sr.started_at IS NOT NULL
                AND sr.finished_at IS NOT NULL
              THEN GREATEST(EXTRACT(EPOCH FROM (sr.finished_at - sr.started_at)) * 1000, 0)
              ELSE NULL
            END AS duration_ms
          FROM step_runs sr
          INNER JOIN pipeline_runs pr ON pr.id = sr.pipeline_run_id
          WHERE ${getRunWindowFilter(sql`sr.started_at`, sql`sr.created_at`, window)}
        )
        SELECT
          pipeline_name,
          step_name,
          COUNT(*)::int AS total_runs,
          COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_runs,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_runs,
          COUNT(*) FILTER (WHERE status = 'running')::int AS running_runs,
          AVG(duration_ms) AS avg_duration_ms,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)
            FILTER (WHERE duration_ms IS NOT NULL) AS p95_duration_ms
        FROM filtered_step_runs
        GROUP BY pipeline_name, step_name
        ORDER BY failed_runs DESC, total_runs DESC, pipeline_name ASC, step_name ASC
      `);

      return Array.from(result).map((row) => ({
        pipelineName: row.pipeline_name,
        stepName: row.step_name,
        totalRuns: parseCount(row.total_runs),
        completedRuns: parseCount(row.completed_runs),
        failedRuns: parseCount(row.failed_runs),
        runningRuns: parseCount(row.running_runs),
        avgDurationMs: parseNullableNumber(row.avg_duration_ms),
        p95DurationMs: parseNullableNumber(row.p95_duration_ms),
      }));
    },
    async fetchRecentFailures(window) {
      const result = await db.execute<{
        content_id: string | null;
        digest_id: string | null;
        duration_ms: number | string | null;
        error_message: string | null;
        failure_at: Date;
        finished_at: Date | null;
        pipeline_name: string;
        pipeline_run_id: string;
        run_type: OpsRunType;
        started_at: Date | null;
        step_name: string | null;
        step_run_id: string | null;
      }>(sql`
        WITH failed_step_runs AS (
          SELECT
            'step'::text AS run_type,
            pr.id AS pipeline_run_id,
            sr.id AS step_run_id,
            pr.pipeline_name,
            sr.step_name,
            pr.content_id,
            pr.digest_id,
            sr.error_message,
            sr.started_at,
            sr.finished_at,
            COALESCE(sr.finished_at, sr.started_at, sr.created_at) AS failure_at,
            CASE
              WHEN sr.started_at IS NOT NULL
                AND sr.finished_at IS NOT NULL
              THEN GREATEST(EXTRACT(EPOCH FROM (sr.finished_at - sr.started_at)) * 1000, 0)
              ELSE NULL
            END AS duration_ms
          FROM step_runs sr
          INNER JOIN pipeline_runs pr ON pr.id = sr.pipeline_run_id
          WHERE sr.status = 'failed'
            AND ${getRunWindowFilter(sql`sr.started_at`, sql`sr.created_at`, window)}
        ),
        failed_pipeline_runs AS (
          SELECT
            'pipeline'::text AS run_type,
            pr.id AS pipeline_run_id,
            NULL::uuid AS step_run_id,
            pr.pipeline_name,
            NULL::varchar AS step_name,
            pr.content_id,
            pr.digest_id,
            NULL::text AS error_message,
            pr.started_at,
            pr.finished_at,
            COALESCE(pr.finished_at, pr.started_at, pr.created_at) AS failure_at,
            CASE
              WHEN pr.started_at IS NOT NULL
                AND pr.finished_at IS NOT NULL
              THEN GREATEST(EXTRACT(EPOCH FROM (pr.finished_at - pr.started_at)) * 1000, 0)
              ELSE NULL
            END AS duration_ms
          FROM pipeline_runs pr
          WHERE pr.status = 'failed'
            AND ${getRunWindowFilter(sql`pr.started_at`, sql`pr.created_at`, window)}
            AND NOT EXISTS (
              SELECT 1
              FROM step_runs sr
              WHERE sr.pipeline_run_id = pr.id
                AND sr.status = 'failed'
            )
        )
        SELECT *
        FROM (
          SELECT * FROM failed_step_runs
          UNION ALL
          SELECT * FROM failed_pipeline_runs
        ) failures
        ORDER BY failure_at DESC, CASE WHEN run_type = 'step' THEN 0 ELSE 1 END, pipeline_name ASC
        LIMIT 20
      `);

      return Array.from(result).map((row) => ({
        runType: row.run_type,
        pipelineRunId: row.pipeline_run_id,
        stepRunId: row.step_run_id,
        pipelineName: row.pipeline_name,
        stepName: row.step_name,
        contentId: row.content_id,
        digestId: row.digest_id,
        errorMessage: row.error_message,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        durationMs: parseNullableNumber(row.duration_ms),
        failureAt: row.failure_at,
      }));
    },
    getBullBoardUrl,
  };
}

export async function loadOpsInsightsPageData(
  input: OpsSearchParams,
  deps: OpsInsightsQueryDeps = createOpsInsightsQueryDeps(),
  now = new Date(),
): Promise<OpsInsightsPageData> {
  const timeZone = getAppEnv().timeZone;
  const normalized = normalizeOpsParams(input);
  const window = getOpsRangeWindow(normalized.range, now, timeZone);

  logger.info("Loading ops insights page data", {
    range: normalized.range,
    windowEnd: window.windowEnd.toISOString(),
    windowStart: window.windowStart?.toISOString() ?? null,
  });

  const [overviewRow, pipelineRows, stepRows, failureRows] = await Promise.all([
    deps.fetchOverview(window),
    deps.fetchPipelineBreakdown(window),
    deps.fetchStepBreakdown(window),
    deps.fetchRecentFailures(window),
  ]);

  const overview = buildOverview(overviewRow);
  const pipelineBreakdown = pipelineRows.map(buildPipelineMetric);
  const stepBreakdown = stepRows.map(buildStepMetric);
  const recentFailures = failureRows.map(buildFailureItem);

  logger.info("Loaded ops insights page data", {
    failedRuns: overview.failedRuns,
    pipelineBreakdownCount: pipelineBreakdown.length,
    recentFailureCount: recentFailures.length,
    stepBreakdownCount: stepBreakdown.length,
    totalRuns: overview.totalRuns,
  });

  return {
    selectedRange: normalized.range,
    timeZone,
    rangeLabel: window.label,
    bullBoardUrl: deps.getBullBoardUrl(),
    overview,
    pipelineBreakdown,
    stepBreakdown,
    recentFailures,
  };
}

export type {
  OpsFailureAggregateRow,
  OpsInsightsQueryDeps,
  OpsOverviewAggregateRow,
  OpsPipelineAggregateRow,
  OpsRangeWindow,
  OpsStepAggregateRow,
};
