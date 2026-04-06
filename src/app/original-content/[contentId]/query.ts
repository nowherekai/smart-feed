import { desc, eq, inArray } from "drizzle-orm";
import { getAppEnv } from "@/config";
import { db } from "@/db";
import {
  analysisRecords,
  contentItemRaws,
  contentItems,
  digestItems,
  digestReports,
  pipelineRuns,
  sources,
  stepRuns,
} from "@/db/schema";
import type {
  ContentDetailAnalysisRecord,
  ContentDetailBase,
  ContentDetailData,
  ContentDetailDigestRelation,
  ContentDetailPipelineRun,
  ContentDetailStepRun,
} from "./types";

type ContentDetailBaseRow = {
  content: typeof contentItems.$inferSelect;
  raw: typeof contentItemRaws.$inferSelect | null;
  source: typeof sources.$inferSelect;
};

type ContentDetailStepRunRow = ContentDetailStepRun & {
  pipelineRunId: string;
};

type ContentDetailQueryDeps = {
  loadAnalysisRecords?: (contentId: string) => Promise<ContentDetailAnalysisRecord[]>;
  loadBase?: (contentId: string) => Promise<ContentDetailBase | null>;
  loadDigestRelations?: (contentId: string) => Promise<ContentDetailDigestRelation[]>;
  loadPipelineRuns?: (contentId: string) => Promise<Array<Omit<ContentDetailPipelineRun, "steps">>>;
  loadStepRuns?: (pipelineRunIds: string[]) => Promise<ContentDetailStepRunRow[]>;
  timeZone?: string;
};

function mapBaseRow(row: ContentDetailBaseRow): ContentDetailBase {
  return {
    id: row.content.id,
    sourceId: row.content.sourceId,
    kind: row.content.kind,
    status: row.content.status,
    externalId: row.content.externalId,
    title: row.content.title,
    author: row.content.author,
    originalUrl: row.content.originalUrl,
    effectiveAt: row.content.effectiveAt,
    publishedAt: row.content.publishedAt,
    fetchedAt: row.content.fetchedAt,
    cleanedMd: row.content.cleanedMd,
    processingError: row.content.processingError,
    createdAt: row.content.createdAt,
    updatedAt: row.content.updatedAt,
    source: {
      id: row.source.id,
      type: row.source.type,
      identifier: row.source.identifier,
      title: row.source.title,
      status: row.source.status,
      weight: row.source.weight,
    },
    raw: row.raw
      ? {
          format: row.raw.format,
          rawBody: row.raw.rawBody,
          rawExcerpt: row.raw.rawExcerpt,
          createdAt: row.raw.createdAt,
        }
      : null,
  };
}

async function loadBase(contentId: string): Promise<ContentDetailBase | null> {
  const [row] = await db
    .select({
      content: contentItems,
      raw: contentItemRaws,
      source: sources,
    })
    .from(contentItems)
    .innerJoin(sources, eq(sources.id, contentItems.sourceId))
    .leftJoin(contentItemRaws, eq(contentItemRaws.contentId, contentItems.id))
    .where(eq(contentItems.id, contentId));

  return row ? mapBaseRow(row) : null;
}

async function loadAnalysisRecords(contentId: string): Promise<ContentDetailAnalysisRecord[]> {
  const rows = await db
    .select({
      id: analysisRecords.id,
      status: analysisRecords.status,
      modelStrategy: analysisRecords.modelStrategy,
      promptVersion: analysisRecords.promptVersion,
      categories: analysisRecords.categories,
      keywords: analysisRecords.keywords,
      entities: analysisRecords.entities,
      language: analysisRecords.language,
      valueScore: analysisRecords.valueScore,
      summary: analysisRecords.summary,
      createdAt: analysisRecords.createdAt,
    })
    .from(analysisRecords)
    .where(eq(analysisRecords.contentId, contentId))
    .orderBy(desc(analysisRecords.createdAt));

  return rows.map((row) => ({
    ...row,
    summary: row.summary
      ? {
          paragraphSummaries: row.summary.paragraphSummaries,
          summary: row.summary.summary,
        }
      : null,
  }));
}

async function loadPipelineRuns(contentId: string): Promise<Array<Omit<ContentDetailPipelineRun, "steps">>> {
  return await db
    .select({
      id: pipelineRuns.id,
      pipelineName: pipelineRuns.pipelineName,
      pipelineVersion: pipelineRuns.pipelineVersion,
      status: pipelineRuns.status,
      startedAt: pipelineRuns.startedAt,
      finishedAt: pipelineRuns.finishedAt,
      createdAt: pipelineRuns.createdAt,
    })
    .from(pipelineRuns)
    .where(eq(pipelineRuns.contentId, contentId))
    .orderBy(desc(pipelineRuns.createdAt));
}

async function loadStepRuns(pipelineRunIds: string[]): Promise<ContentDetailStepRunRow[]> {
  if (pipelineRunIds.length === 0) {
    return [];
  }

  return await db
    .select({
      id: stepRuns.id,
      pipelineRunId: stepRuns.pipelineRunId,
      stepName: stepRuns.stepName,
      status: stepRuns.status,
      inputRef: stepRuns.inputRef,
      outputRef: stepRuns.outputRef,
      errorMessage: stepRuns.errorMessage,
      startedAt: stepRuns.startedAt,
      finishedAt: stepRuns.finishedAt,
      createdAt: stepRuns.createdAt,
    })
    .from(stepRuns)
    .where(inArray(stepRuns.pipelineRunId, pipelineRunIds))
    .orderBy(stepRuns.createdAt);
}

async function loadDigestRelations(contentId: string): Promise<ContentDetailDigestRelation[]> {
  return await db
    .select({
      digestItemId: digestItems.id,
      sectionTitle: digestItems.sectionTitle,
      rank: digestItems.rank,
      digestId: digestReports.id,
      digestDate: digestReports.digestDate,
      period: digestReports.period,
      digestStatus: digestReports.status,
      analysisRecordId: analysisRecords.id,
    })
    .from(digestItems)
    .innerJoin(digestReports, eq(digestReports.id, digestItems.digestId))
    .innerJoin(analysisRecords, eq(analysisRecords.id, digestItems.analysisRecordId))
    .where(eq(analysisRecords.contentId, contentId))
    .orderBy(desc(digestReports.digestDate), digestItems.rank);
}

function buildPipelineRuns(
  runs: Array<Omit<ContentDetailPipelineRun, "steps">>,
  steps: ContentDetailStepRunRow[],
): ContentDetailPipelineRun[] {
  const stepsByPipelineRunId = new Map<string, ContentDetailStepRun[]>();

  for (const step of steps) {
    const currentSteps = stepsByPipelineRunId.get(step.pipelineRunId) ?? [];
    currentSteps.push({
      id: step.id,
      stepName: step.stepName,
      status: step.status,
      inputRef: step.inputRef,
      outputRef: step.outputRef,
      errorMessage: step.errorMessage,
      startedAt: step.startedAt,
      finishedAt: step.finishedAt,
      createdAt: step.createdAt,
    });
    stepsByPipelineRunId.set(step.pipelineRunId, currentSteps);
  }

  return runs.map((run) => ({
    ...run,
    steps: stepsByPipelineRunId.get(run.id) ?? [],
  }));
}

function buildQueryDeps(overrides: ContentDetailQueryDeps): Required<ContentDetailQueryDeps> {
  return {
    loadAnalysisRecords: overrides.loadAnalysisRecords ?? loadAnalysisRecords,
    loadBase: overrides.loadBase ?? loadBase,
    loadDigestRelations: overrides.loadDigestRelations ?? loadDigestRelations,
    loadPipelineRuns: overrides.loadPipelineRuns ?? loadPipelineRuns,
    loadStepRuns: overrides.loadStepRuns ?? loadStepRuns,
    timeZone: overrides.timeZone ?? getAppEnv().timeZone,
  };
}

export async function loadContentDetail(
  contentId: string,
  deps: ContentDetailQueryDeps = {},
): Promise<ContentDetailData | null> {
  const normalizedContentId = contentId.trim();

  if (!normalizedContentId) {
    return null;
  }

  const resolvedDeps = buildQueryDeps(deps);
  const base = await resolvedDeps.loadBase(normalizedContentId);

  if (!base) {
    return null;
  }

  const [analysis, runs, digestRelations] = await Promise.all([
    resolvedDeps.loadAnalysisRecords(normalizedContentId),
    resolvedDeps.loadPipelineRuns(normalizedContentId),
    resolvedDeps.loadDigestRelations(normalizedContentId),
  ]);
  const steps = runs.length > 0 ? await resolvedDeps.loadStepRuns(runs.map((run) => run.id)) : [];

  return {
    base,
    analysisRecords: analysis,
    pipelineRuns: buildPipelineRuns(runs, steps),
    digestRelations,
    timeZone: resolvedDeps.timeZone,
  };
}

export type { ContentDetailQueryDeps };
