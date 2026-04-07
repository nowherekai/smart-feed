import { expect, test } from "bun:test";
import { getOpsRangeWindow, loadOpsInsightsPageData, normalizeOpsParams, type OpsInsightsQueryDeps } from "./query";

test("normalizeOpsParams falls back to week for invalid range", () => {
  expect(normalizeOpsParams({ range: "invalid" })).toEqual({ range: "week" });
  expect(normalizeOpsParams({ range: ["month", "day"] })).toEqual({ range: "month" });
});

test("getOpsRangeWindow computes Asia/Shanghai natural windows", () => {
  const now = new Date("2026-04-07T04:30:00.000Z");

  expect(getOpsRangeWindow("day", now, "Asia/Shanghai")).toMatchObject({
    label: "今日（4/7）",
  });
  expect(getOpsRangeWindow("day", now, "Asia/Shanghai").windowStart?.toISOString()).toBe("2026-04-06T16:00:00.000Z");
  expect(getOpsRangeWindow("week", now, "Asia/Shanghai").windowStart?.toISOString()).toBe("2026-04-05T16:00:00.000Z");
  expect(getOpsRangeWindow("month", now, "Asia/Shanghai").windowStart?.toISOString()).toBe("2026-03-31T16:00:00.000Z");
  expect(getOpsRangeWindow("all", now, "Asia/Shanghai").windowStart).toBeNull();
});

test("loadOpsInsightsPageData computes rates from terminal runs only", async () => {
  const deps: OpsInsightsQueryDeps = {
    async fetchOverview() {
      return {
        totalRuns: 14,
        completedRuns: 8,
        failedRuns: 2,
        runningRuns: 3,
        pendingRuns: 1,
        avgDurationMs: 2400,
        p95DurationMs: 8000,
      };
    },
    async fetchPipelineBreakdown() {
      return [
        {
          pipelineName: "content-processing",
          totalRuns: 10,
          completedRuns: 7,
          failedRuns: 1,
          runningRuns: 2,
          avgDurationMs: 2000,
          p95DurationMs: 7000,
        },
      ];
    },
    async fetchStepBreakdown() {
      return [
        {
          pipelineName: "content-processing",
          stepName: "content.fetch-html",
          totalRuns: 10,
          completedRuns: 6,
          failedRuns: 2,
          runningRuns: 1,
          avgDurationMs: 1200,
          p95DurationMs: 4000,
        },
      ];
    },
    async fetchRecentFailures() {
      return [
        {
          runType: "pipeline",
          pipelineRunId: "pipeline-1",
          stepRunId: null,
          pipelineName: "digest-generation",
          stepName: null,
          contentId: null,
          digestId: "digest-1",
          errorMessage: null,
          startedAt: new Date("2026-04-07T04:00:00.000Z"),
          finishedAt: new Date("2026-04-07T04:05:00.000Z"),
          durationMs: 300000,
          failureAt: new Date("2026-04-07T04:05:00.000Z"),
        },
      ];
    },
    getBullBoardUrl() {
      return "http://127.0.0.1:3010/admin/queues";
    },
  };
  const data = await loadOpsInsightsPageData({ range: "day" }, deps, new Date("2026-04-07T04:30:00.000Z"));

  expect(data.selectedRange).toBe("day");
  expect(data.bullBoardUrl).toBe("http://127.0.0.1:3010/admin/queues");
  expect(data.overview.successRate).toBeCloseTo(0.8);
  expect(data.overview.failureRate).toBeCloseTo(0.2);
  expect(data.overview.runningRuns).toBe(3);
  expect(data.overview.pendingRuns).toBe(1);
  expect(data.pipelineBreakdown[0]).toMatchObject({
    pipelineName: "content-processing",
    successRate: 0.875,
    failureRate: 0.125,
  });
  expect(data.stepBreakdown[0]).toMatchObject({
    pipelineName: "content-processing",
    stepName: "content.fetch-html",
    successRate: 0.75,
    failureRate: 0.25,
  });
  expect(data.recentFailures[0]?.errorMessage).toBe("Pipeline run failed without step-level error message.");
});

test("loadOpsInsightsPageData handles empty datasets", async () => {
  const deps: OpsInsightsQueryDeps = {
    async fetchOverview() {
      return {
        totalRuns: 0,
        completedRuns: 0,
        failedRuns: 0,
        runningRuns: 0,
        pendingRuns: 0,
        avgDurationMs: null,
        p95DurationMs: null,
      };
    },
    async fetchPipelineBreakdown() {
      return [];
    },
    async fetchStepBreakdown() {
      return [];
    },
    async fetchRecentFailures() {
      return [];
    },
    getBullBoardUrl() {
      return "http://127.0.0.1:3010/admin/queues";
    },
  };
  const data = await loadOpsInsightsPageData({}, deps, new Date("2026-04-07T04:30:00.000Z"));

  expect(data.selectedRange).toBe("week");
  expect(data.overview.successRate).toBeNull();
  expect(data.overview.failureRate).toBeNull();
  expect(data.pipelineBreakdown).toEqual([]);
  expect(data.stepBreakdown).toEqual([]);
  expect(data.recentFailures).toEqual([]);
});
