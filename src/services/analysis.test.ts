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
    evidenceSnippet: null,
    id: "analysis-1",
    keywords: ["ai"],
    language: "zh",
    modelStrategy: "dummy-basic",
    originalUrl: "https://example.com/post",
    promptVersion: "basic-analysis-v1",
    sentiment: "neutral",
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
  const analysisUpdates: Array<{ data: Record<string, unknown>; id: string }> = [];
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
        sentiment: "neutral",
        valueScore: 8,
      };
    },
    async updateAnalysisRecord(id: string, data: Record<string, unknown>) {
      analysisUpdates.push({ id, data });
      return createAnalysisRecord({ id, ...data }) as never;
    },
    async updateContentItem(_contentId: string, data: Record<string, unknown>) {
      contentUpdates.push(data);
    },
  };

  return {
    analysisRecords,
    analysisUpdates,
    contentUpdates,
    deps,
  };
}

function createHeavyHarness() {
  const analysisRecords: Array<Record<string, unknown>> = [];
  const analysisUpdates: Array<{ data: Record<string, unknown>; id: string }> = [];
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
        evidenceSnippet: "not found exactly in article",
        oneline: "Heavy summary oneline",
        points: ["Point A", "Point B"],
        reason: "Worth digesting",
      };
    },
    async updateAnalysisRecord(id: string, data: Record<string, unknown>) {
      analysisUpdates.push({ id, data });
      return createAnalysisRecord({ id, ...data }) as never;
    },
    async updateContentItem(_contentId: string, data: Record<string, unknown>) {
      contentUpdates.push(data);
    },
  };

  return {
    analysisRecords,
    analysisUpdates,
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
  expect(harness.analysisRecords).toHaveLength(1);
  expect(harness.contentUpdates.at(-1)).toMatchObject({
    processingError: null,
  });
});

test("runContentAnalyzeBasic creates a fresh debug record when new-record mode is requested", async () => {
  const harness = createBasicHarness();
  const findCalls: Array<{ modelStrategy: string; promptVersion: string }> = [];
  harness.deps.findAnalysisRecord = async (_contentId, modelStrategy, promptVersion) => {
    findCalls.push({ modelStrategy, promptVersion });
    return null;
  };

  const result = await runContentAnalyzeBasic(
    {
      contentId: "content-1",
      debugOptions: {
        continueToHeavy: false,
        recordMode: "new-record",
        rerunKey: "rerun-abc",
        variantTag: "api-b",
      },
      trigger: "content.normalize",
    },
    harness.deps,
  );

  expect(findCalls).toEqual([
    {
      modelStrategy: "dummy-basic",
      promptVersion: "basic-analysis-v1~api-b-rerun-abc",
    },
  ]);
  expect(harness.analysisRecords.at(-1)).toMatchObject({
    promptVersion: "basic-analysis-v1~api-b-rerun-abc",
  });
  expect(result.nextStep).toBeNull();
});

test("runContentAnalyzeBasic overwrites an existing debug slot when overwrite mode is requested", async () => {
  const harness = createBasicHarness();
  harness.deps.findAnalysisRecord = async () =>
    createAnalysisRecord({
      id: "analysis-existing",
      promptVersion: "basic-analysis-v1~api-b",
      valueScore: 3,
    }) as never;

  const result = await runContentAnalyzeBasic(
    {
      contentId: "content-1",
      debugOptions: {
        continueToHeavy: false,
        recordMode: "overwrite",
        variantTag: "api-b",
      },
      trigger: "content.normalize",
    },
    harness.deps,
  );

  expect(harness.analysisRecords).toHaveLength(0);
  expect(harness.analysisUpdates).toHaveLength(1);
  expect(harness.analysisUpdates[0]).toMatchObject({
    id: "analysis-existing",
  });
  expect(harness.analysisUpdates[0]?.data).toMatchObject({
    promptVersion: "basic-analysis-v1~api-b",
    status: "basic",
  });
  expect(result.payload?.analysisRecordId).toBe("analysis-existing");
  expect(result.payload?.cached).toBe(false);
  expect(result.nextStep).toBeNull();
});

test("runContentAnalyzeBasic keeps heavy continuation for debug full-flow runs", async () => {
  const harness = createBasicHarness();

  const result = await runContentAnalyzeBasic(
    {
      contentId: "content-1",
      debugOptions: {
        continueToHeavy: true,
        recordMode: "overwrite",
        variantTag: "api-b",
      },
      trigger: "content.normalize",
    },
    harness.deps,
  );

  expect(result.nextStep?.data).toMatchObject({
    contentId: "content-1",
    debugOptions: {
      continueToHeavy: true,
      recordMode: "overwrite",
      variantTag: "api-b",
    },
    trigger: "content.analyze.basic",
  });
});

test("runContentAnalyzeBasic completes pipeline directly when threshold is not exceeded", async () => {
  const harness = createBasicHarness();
  harness.deps.runBasicAnalysis = async () => ({
    categories: ["general"],
    entities: ["Example Feed"],
    keywords: ["note"],
    language: "zh",
    sentiment: "neutral",
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

test("runContentAnalyzeBasic returns failed when AI provider is disabled", async () => {
  const harness = createBasicHarness();
  harness.deps.resolveBasicTaskConfig = () => ({
    baseURL: null,
    modelId: null,
    modelStrategy: null,
    promptVersion: "basic-analysis-v1",
    runtimeState: "disabled",
  });

  const result = await runContentAnalyzeBasic(
    {
      contentId: "content-1",
      trigger: "content.normalize",
    },
    harness.deps,
  );

  expect(result).toEqual({
    message: "[services/analysis] AI provider is not configured for content.analyze.basic.",
    nextStep: null,
    outcome: "failed",
    payload: {
      analysisRecordId: null,
      cached: false,
      contentId: "content-1",
      modelStrategy: null,
      promptVersion: "basic-analysis-v1",
      runtimeState: "disabled",
      thresholdExceeded: false,
      valueScore: null,
    },
    status: "failed",
  });
});

test("runContentAnalyzeHeavy writes full analysis record and validates evidence snippet fallback", async () => {
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
      digestEligible: true,
      evidenceSnippet: "cleaned article body with enough evidence for heavy summary",
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
      oneline: "Heavy summary oneline",
      points: ["Point A", "Point B"],
      reason: "Worth digesting",
    },
  });
  expect(harness.contentUpdates.at(-1)).toMatchObject({
    processingError: null,
    status: "analyzed",
  });
});

test("runContentAnalyzeHeavy overwrites an existing debug slot when overwrite mode is requested", async () => {
  const harness = createHeavyHarness();
  harness.deps.findAnalysisRecord = async () =>
    createAnalysisRecord({
      id: "analysis-heavy-existing",
      promptVersion: "heavy-summary-v1~api-b",
      status: "full",
    }) as never;

  const result = await runContentAnalyzeHeavy(
    {
      contentId: "content-1",
      debugOptions: {
        recordMode: "overwrite",
        variantTag: "api-b",
      },
      trigger: "content.analyze.basic",
    },
    harness.deps,
  );

  expect(harness.analysisRecords).toHaveLength(0);
  expect(harness.analysisUpdates).toHaveLength(1);
  expect(harness.analysisUpdates[0]?.data).toMatchObject({
    promptVersion: "heavy-summary-v1~api-b",
  });
  expect(result.payload?.analysisRecordId).toBe("analysis-heavy-existing");
  expect(result.payload?.cached).toBe(false);
});

test("runContentAnalyzeHeavy returns failed when basic analysis record is missing", async () => {
  const harness = createHeavyHarness();
  harness.deps.findLatestBasicAnalysisRecordByContentId = async () => null;

  const result = await runContentAnalyzeHeavy(
    {
      contentId: "content-1",
      trigger: "content.analyze.basic",
    },
    harness.deps,
  );

  expect(result).toEqual({
    message: '[services/analysis] Content "content-1" is missing a basic analysis record before heavy analysis.',
    nextStep: null,
    outcome: "failed",
    payload: {
      analysisRecordId: null,
      cached: false,
      contentId: "content-1",
      digestEligible: false,
      evidenceSnippet: null,
      modelStrategy: null,
      promptVersion: "heavy-summary-v1",
      runtimeState: "dummy",
      status: null,
    },
    status: "failed",
  });
});

test("runContentAnalyzeHeavy returns failed when openrouter config is incomplete", async () => {
  const harness = createHeavyHarness();
  harness.deps.resolveHeavyTaskConfig = () => {
    throw new Error("[ai/client] SMART_FEED_AI_PROVIDER=openrouter requires SMART_FEED_AI_HEAVY_MODEL.");
  };

  const result = await runContentAnalyzeHeavy(
    {
      contentId: "content-1",
      trigger: "content.analyze.basic",
    },
    harness.deps,
  );

  expect(result).toEqual({
    message: "[ai/client] SMART_FEED_AI_PROVIDER=openrouter requires SMART_FEED_AI_HEAVY_MODEL.",
    nextStep: null,
    outcome: "failed",
    payload: {
      analysisRecordId: null,
      cached: false,
      contentId: "content-1",
      digestEligible: false,
      evidenceSnippet: null,
      modelStrategy: null,
      promptVersion: "heavy-summary-v1",
      runtimeState: "openrouter",
      status: null,
    },
    status: "failed",
  });
});
