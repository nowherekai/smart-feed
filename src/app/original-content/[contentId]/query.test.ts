import { expect, test } from "bun:test";
import { loadContentDetail } from "./query";
import type {
  ContentDetailAnalysisRecord,
  ContentDetailBase,
  ContentDetailDigestRelation,
  ContentDetailPipelineRun,
  ContentDetailStepRun,
} from "./types";

function createBase(overrides: Partial<ContentDetailBase> = {}): ContentDetailBase {
  return {
    id: "content-1",
    sourceId: "source-1",
    kind: "article",
    status: "normalized",
    externalId: "external-1",
    title: "Content title",
    author: "Kai",
    originalUrl: "https://example.com/post",
    effectiveAt: new Date("2026-04-02T08:00:00.000Z"),
    publishedAt: new Date("2026-04-02T07:00:00.000Z"),
    fetchedAt: new Date("2026-04-02T08:10:00.000Z"),
    cleanedMd: "# Hello",
    processingError: null,
    createdAt: new Date("2026-04-02T08:10:00.000Z"),
    updatedAt: new Date("2026-04-02T08:20:00.000Z"),
    source: {
      id: "source-1",
      type: "rss-source",
      identifier: "https://example.com/feed.xml",
      title: "Example Feed",
      status: "active",
      weight: 1,
    },
    raw: {
      format: "html",
      rawBody: "<p>Hello</p>",
      rawExcerpt: "<p>Excerpt</p>",
      createdAt: new Date("2026-04-02T08:11:00.000Z"),
    },
    ...overrides,
  };
}

function createAnalysisRecord(overrides: Partial<ContentDetailAnalysisRecord> = {}): ContentDetailAnalysisRecord {
  return {
    id: "analysis-1",
    status: "basic",
    modelStrategy: "gpt-5.4-mini",
    promptVersion: "basic-analysis-v1",
    categories: ["AI"],
    keywords: ["LLM"],
    entities: ["OpenAI"],
    language: "en",
    valueScore: 7,
    summary: {
      paragraphSummaries: ["Point A", "Point B"],
      summary: "One line",
    },
    createdAt: new Date("2026-04-02T08:30:00.000Z"),
    ...overrides,
  };
}

function createPipelineRun(
  overrides: Partial<Omit<ContentDetailPipelineRun, "steps">> = {},
): Omit<ContentDetailPipelineRun, "steps"> {
  return {
    id: "run-1",
    pipelineName: "content-processing",
    pipelineVersion: "v1",
    status: "completed",
    startedAt: new Date("2026-04-02T08:00:00.000Z"),
    finishedAt: new Date("2026-04-02T08:20:00.000Z"),
    createdAt: new Date("2026-04-02T08:00:00.000Z"),
    ...overrides,
  };
}

function createStepRun(
  pipelineRunId: string,
  overrides: Partial<ContentDetailStepRun> = {},
): ContentDetailStepRun & { pipelineRunId: string } {
  return {
    id: `${pipelineRunId}-step-1`,
    pipelineRunId,
    stepName: "content.fetch-html",
    status: "completed",
    inputRef: null,
    outputRef: null,
    errorMessage: null,
    startedAt: new Date("2026-04-02T08:01:00.000Z"),
    finishedAt: new Date("2026-04-02T08:02:00.000Z"),
    createdAt: new Date("2026-04-02T08:01:00.000Z"),
    ...overrides,
  };
}

function createDigestRelation(overrides: Partial<ContentDetailDigestRelation> = {}): ContentDetailDigestRelation {
  return {
    digestItemId: "digest-item-1",
    sectionTitle: "AI & ML",
    rank: 2,
    digestId: "digest-1",
    digestDate: "2026-04-02",
    period: "daily",
    digestStatus: "sent",
    analysisRecordId: "analysis-1",
    ...overrides,
  };
}

test("loadContentDetail groups step runs under their pipeline runs", async () => {
  const detail = await loadContentDetail("content-1", {
    loadBase: async () => createBase(),
    loadAnalysisRecords: async () => [createAnalysisRecord()],
    loadPipelineRuns: async () => [
      createPipelineRun({ id: "run-2", createdAt: new Date("2026-04-02T09:00:00.000Z") }),
      createPipelineRun({ id: "run-1", createdAt: new Date("2026-04-02T08:00:00.000Z") }),
    ],
    loadStepRuns: async () => [
      createStepRun("run-1", { id: "step-1", stepName: "content.fetch-html" }),
      createStepRun("run-2", { id: "step-2", stepName: "content.analyze.basic" }),
      createStepRun("run-2", { id: "step-3", stepName: "content.analyze.heavy" }),
    ],
    loadDigestRelations: async () => [createDigestRelation()],
    timeZone: "Asia/Shanghai",
  });

  expect(detail).not.toBeNull();
  expect(detail?.analysisRecords[0]?.summary).toEqual({
    paragraphSummaries: ["Point A", "Point B"],
    summary: "One line",
  });
  expect(detail?.pipelineRuns).toHaveLength(2);
  expect(detail?.digestRelations).toEqual([createDigestRelation()]);
});

test("loadContentDetail returns null without fetching related records when base data is missing", async () => {
  let relatedQueries = 0;

  const detail = await loadContentDetail("missing-content", {
    loadBase: async () => null,
    loadAnalysisRecords: async () => {
      relatedQueries += 1;
      return [];
    },
    loadPipelineRuns: async () => {
      relatedQueries += 1;
      return [];
    },
    loadStepRuns: async () => {
      relatedQueries += 1;
      return [];
    },
    loadDigestRelations: async () => {
      relatedQueries += 1;
      return [];
    },
  });

  expect(detail).toBeNull();
  expect(relatedQueries).toBe(0);
});
