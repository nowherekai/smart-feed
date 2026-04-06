import { expect, test } from "bun:test";

import {
  type ContentAnalyzeBasicDeps,
  type ContentAnalyzeHeavyDeps,
  runContentAnalyzeBasic,
  runContentAnalyzeHeavy,
} from "./analysis";

function createAnalysisRecord(overrides: Record<string, unknown> = {}) {
  return {
    categories: ["ai"],
    contentId: "content-1",
    contentTraceId: "content-1",
    createdAt: new Date("2026-03-31T00:00:00.000Z"),
    entities: ["Example Feed"],
    id: "analysis-1",
    keywords: ["ai"],
    language: "zh",
    modelStrategy: "dummy-basic",
    originalUrl: "https://example.com/post",
    promptVersion: "basic-analysis-v1",
    sourceId: "source-1",
    sourceName: "Example Feed",
    sourceTraceId: "source-1",
    status: "basic" as const,
    summary: null,
    valueScore: 8,
    ...overrides,
  };
}

function createContentRecord() {
  return {
    content: {
      author: "Alice",
      cleanedMd: "cleaned article body with enough evidence for heavy summary",
      createdAt: new Date("2026-03-31T00:00:00.000Z"),
      effectiveAt: new Date("2026-03-31T00:00:00.000Z"),
      externalId: "guid-1",
      fetchedAt: new Date("2026-03-31T00:00:00.000Z"),
      id: "content-1",
      kind: "article",
      mediaUrl: null,
      normalizedOriginalUrl: "https://example.com/post",
      originalUrl: "https://example.com/post",
      originalUrlHash: "hash-1",
      processingError: null,
      publishedAt: new Date("2026-03-31T00:00:00.000Z"),
      sourceId: "source-1",
      status: "normalized",
      title: "Article Title",
      updatedAt: new Date("2026-03-31T00:00:00.000Z"),
    },
    source: {
      createdAt: new Date("2026-03-30T00:00:00.000Z"),
      firstImportedAt: new Date("2026-03-30T00:00:00.000Z"),
      id: "source-1",
      identifier: "https://example.com/feed.xml",
      lastErrorAt: null,
      lastErrorMessage: null,
      lastPolledAt: null,
      lastSuccessfulSyncAt: null,
      siteUrl: "https://example.com",
      status: "active",
      syncCursor: null,
      title: "Example Feed",
      type: "rss-source",
      updatedAt: new Date("2026-03-30T00:00:00.000Z"),
      weight: 1,
    },
  } as never;
}

function createBasicHarness() {
  const analysisRecords: Array<Record<string, unknown>> = [];
  const contentUpdates: Array<Record<string, unknown>> = [];
  const deps: ContentAnalyzeBasicDeps = {
    appEnv: {
      valueScoreThreshold: 6,
    },
    async createAnalysisRecord(data: Record<string, unknown>) {
      analysisRecords.push(data);
      return createAnalysisRecord({ id: "analysis-1", ...data }) as never;
    },
    async findAnalysisRecord() {
      return null;
    },
    async getContentForAnalysisById() {
      return createContentRecord();
    },
    resolveBasicTaskConfig() {
      return {
        baseURL: null,
        modelId: "dummy",
        modelStrategy: "dummy-basic",
        promptVersion: "basic-analysis-v1",
        runtimeState: "dummy",
      };
    },
    async runBasicAnalysis() {
      return {
        categories: ["ai"],
        entities: ["Example Feed"],
        keywords: ["ai"],
        language: "zh",
        valueScore: 8,
      };
    },
    async updateAnalysisRecord(id: string, data: Record<string, unknown>) {
      analysisRecords.push({ id, ...data });
      return createAnalysisRecord({ id, ...data }) as never;
    },
    async updateContentItem(_contentId: string, data: Record<string, unknown>) {
      contentUpdates.push(data);
    },
  };

  return {
    analysisRecords,
    contentUpdates,
    deps,
  };
}

function createHeavyHarness() {
  const analysisRecords: Array<Record<string, unknown>> = [];
  const contentUpdates: Array<Record<string, unknown>> = [];
  const deps: ContentAnalyzeHeavyDeps = {
    async createAnalysisRecord(data: Record<string, unknown>) {
      analysisRecords.push(data);
      return createAnalysisRecord({ id: "analysis-heavy-1", ...data }) as never;
    },
    async findAnalysisRecord() {
      return null;
    },
    async findLatestBasicAnalysisRecordByContentId() {
      return createAnalysisRecord() as never;
    },
    async getContentForAnalysisById() {
      return createContentRecord();
    },
    resolveHeavyTaskConfig() {
      return {
        baseURL: null,
        modelId: "dummy",
        modelStrategy: "dummy-heavy",
        promptVersion: "heavy-summary-v1",
        runtimeState: "dummy",
      };
    },
    async runHeavySummary() {
      return {
        paragraphSummaries: ["Point A", "Point B"],
        summary: "Heavy summary body",
      };
    },
    async updateAnalysisRecord(id: string, data: Record<string, unknown>) {
      analysisRecords.push({ id, ...data });
      return createAnalysisRecord({ id, ...data }) as never;
    },
    async updateContentItem(_contentId: string, data: Record<string, unknown>) {
      contentUpdates.push(data);
    },
  };

  return {
    analysisRecords,
    contentUpdates,
    deps,
  };
}

test("runContentAnalyzeBasic writes analysis record and enqueues heavy when threshold is exceeded", async () => {
  const harness = createBasicHarness();

  const result = await runContentAnalyzeBasic(
    {
      contentId: "content-1",
      trigger: "content.normalize",
    },
    harness.deps,
  );

  expect(result).toEqual({
    message: null,
    nextStep: {
      data: {
        contentId: "content-1",
        trigger: "content.analyze.basic",
      },
      jobName: "content.analyze.heavy",
    },
    outcome: "completed",
    payload: {
      analysisRecordId: "analysis-1",
      cached: false,
      contentId: "content-1",
      modelStrategy: "dummy-basic",
      promptVersion: "basic-analysis-v1",
      runtimeState: "dummy",
      thresholdExceeded: true,
      valueScore: 8,
    },
    status: "completed",
  });
  expect(harness.analysisRecords.at(-1)).toMatchObject({
    categories: ["ai"],
    summary: null,
    valueScore: 8,
  });
  expect(harness.contentUpdates.at(-1)).toMatchObject({
    processingError: null,
  });
});

test("runContentAnalyzeBasic finishes pipeline when threshold is not exceeded", async () => {
  const harness = createBasicHarness();
  harness.deps.runBasicAnalysis = async () => ({
    categories: ["general"],
    entities: ["Example Feed"],
    keywords: ["digest"],
    language: "zh",
    valueScore: 5,
  });

  const result = await runContentAnalyzeBasic(
    {
      contentId: "content-1",
      trigger: "content.normalize",
    },
    harness.deps,
  );

  expect(result.nextStep).toBeNull();
  expect(result.payload?.thresholdExceeded).toBe(false);
  expect(harness.contentUpdates.at(-1)).toMatchObject({
    processingError: null,
    status: "analyzed",
  });
});

test("runContentAnalyzeHeavy writes a full summary record", async () => {
  const harness = createHeavyHarness();

  const result = await runContentAnalyzeHeavy(
    {
      contentId: "content-1",
      trigger: "content.analyze.basic",
    },
    harness.deps,
  );

  expect(result).toEqual({
    message: null,
    nextStep: null,
    outcome: "completed",
    payload: {
      analysisRecordId: "analysis-heavy-1",
      cached: false,
      contentId: "content-1",
      modelStrategy: "dummy-heavy",
      promptVersion: "heavy-summary-v1",
      runtimeState: "dummy",
      status: "full",
    },
    status: "completed",
  });
  expect(harness.analysisRecords.at(-1)).toMatchObject({
    modelStrategy: "dummy-heavy",
    promptVersion: "heavy-summary-v1",
    status: "full",
    summary: {
      paragraphSummaries: ["Point A", "Point B"],
      summary: "Heavy summary body",
    },
  });
  expect(harness.contentUpdates.at(-1)).toMatchObject({
    processingError: null,
    status: "analyzed",
  });
});

test("runContentAnalyzeHeavy returns cache hit without re-running model", async () => {
  const harness = createHeavyHarness();
  harness.deps.findAnalysisRecord = async () =>
    createAnalysisRecord({
      id: "analysis-cache-1",
      modelStrategy: "dummy-heavy",
      promptVersion: "heavy-summary-v1",
      status: "full",
      summary: {
        paragraphSummaries: ["Cached paragraph"],
        summary: "Cached summary",
      },
    }) as never;

  const result = await runContentAnalyzeHeavy(
    {
      contentId: "content-1",
      trigger: "content.analyze.basic",
    },
    harness.deps,
  );

  expect(result).toEqual({
    message: "content.analyze.heavy cache hit",
    nextStep: null,
    outcome: "completed",
    payload: {
      analysisRecordId: "analysis-cache-1",
      cached: true,
      contentId: "content-1",
      modelStrategy: "dummy-heavy",
      promptVersion: "heavy-summary-v1",
      runtimeState: "dummy",
      status: "full",
    },
    status: "completed",
  });
  expect(harness.analysisRecords).toHaveLength(0);
});

test("runContentAnalyzeHeavy fails when basic record is missing", async () => {
  const harness = createHeavyHarness();
  harness.deps.findLatestBasicAnalysisRecordByContentId = async () => null;

  const result = await runContentAnalyzeHeavy(
    {
      contentId: "content-1",
      trigger: "content.analyze.basic",
    },
    harness.deps,
  );

  expect(result.status).toBe("failed");
  expect(result.payload ?? null).toEqual({
    analysisRecordId: null,
    cached: false,
    contentId: "content-1",
    modelStrategy: null,
    promptVersion: "heavy-summary-v1",
    runtimeState: "dummy",
    status: null,
  });
  expect(harness.contentUpdates.at(-1)).toMatchObject({
    status: "failed",
  });
});
