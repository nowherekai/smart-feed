import { and, desc, eq, gte, lte, ne } from "drizzle-orm";

import { type AppEnv, getAppEnv } from "../config";
import { type AnalysisSummary, analysisRecords, contentItems, digestItems, digestReports, getDb, sources } from "../db";
import { createCompletedStepResult, type PipelineStepResult } from "../pipeline/types";
import { jobNames } from "../queue";
import { getDigestWindow } from "../utils";
import { type DigestRenderableItem, type DigestRenderSection, renderDigestMarkdown } from "./digest-renderer";
import { canEnterDigest } from "./traceability";

type DigestReportRecord = typeof digestReports.$inferSelect;
type NewDigestReport = typeof digestReports.$inferInsert;
type DigestReportUpdate = Partial<Omit<NewDigestReport, "id">>;
type NewDigestItem = typeof digestItems.$inferInsert;

type DigestSummary = AnalysisSummary;

type DigestComposeRow = {
  analysisCreatedAt: Date;
  analysisRecordId: string;
  categories: string[];
  contentEffectiveAt: Date;
  contentId: string;
  contentTitle: string | null;
  contentTraceId: string | null;
  evidenceSnippet: string | null;
  originalUrl: string;
  sourceName: string;
  sourceStatus: "active" | "blocked" | "paused";
  sourceTraceId: string | null;
  summary: DigestSummary | null;
  valueScore: number;
};

type DigestSectionItem = DigestRenderableItem & {
  analysisCreatedAt: Date;
  analysisRecordId: string;
  contentEffectiveAt: Date;
  contentId: string;
  sectionTitle: string;
  valueScore: number;
};

type DigestComposeCandidate = {
  items: DigestSectionItem[];
  sections: DigestRenderSection[];
};

type PersistDigestInput = {
  digestCandidate: DigestComposeCandidate;
  digestDate: string;
  emailSubject: string;
  existingReport: DigestReportRecord | null;
  markdownBody: string;
  windowEnd: Date;
  windowStart: Date;
};

export type DigestComposeJobData = {
  pipelineRunId?: string;
  trigger: "manual" | "scheduler";
};

export type DigestDeliverJobData = {
  digestId: string;
  pipelineRunId?: string;
  trigger: "digest.compose";
};

export type DigestComposePayload = {
  digestDate: string;
  digestId: string | null;
  emptyDigest: boolean;
  itemCount: number;
  reusedExistingDigest: boolean;
  skippedBecauseAlreadySent: boolean;
  windowEnd: string;
  windowStart: string;
};

export type DigestComposeDeps = {
  appEnv?: Pick<AppEnv, "digestMaxLookbackHours" | "digestSendHour" | "digestTimeZone">;
  collectDigestRows?: (windowStart: Date, windowEnd: Date) => Promise<DigestComposeRow[]>;
  findDigestReportByDate?: (digestDate: string) => Promise<DigestReportRecord | null>;
  findLatestSentDigestReport?: () => Promise<DigestReportRecord | null>;
  now?: () => Date;
  persistDigest?: (input: PersistDigestInput) => Promise<string>;
  renderMarkdown?: (input: { digestDate: string; sections: DigestRenderSection[] }) => string;
};

function requireInsertedRow<T>(row: T | undefined, entityName: string): T {
  if (!row) {
    throw new Error(`[services/digest] Failed to insert ${entityName}.`);
  }

  return row;
}

function toDateLabel(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";

  return `${year}-${month}-${day}`;
}

function getEmailSubject(digestDate: string): string {
  return `[smart-feed] 日报 ${digestDate}`;
}

function hasRenderableSummary(summary: DigestSummary | null): summary is DigestSummary {
  return Boolean(
    summary &&
      typeof summary.oneline === "string" &&
      typeof summary.reason === "string" &&
      Array.isArray(summary.points) &&
      summary.points.length > 0,
  );
}

function getSectionTitle(categories: string[]): string {
  const primaryCategory = categories[0]?.trim();
  return primaryCategory ? primaryCategory : "未分类";
}

function sortDigestItems(left: DigestSectionItem, right: DigestSectionItem): number {
  if (left.valueScore !== right.valueScore) {
    return right.valueScore - left.valueScore;
  }

  if (left.contentEffectiveAt.getTime() !== right.contentEffectiveAt.getTime()) {
    return right.contentEffectiveAt.getTime() - left.contentEffectiveAt.getTime();
  }

  if (left.analysisCreatedAt.getTime() !== right.analysisCreatedAt.getTime()) {
    return right.analysisCreatedAt.getTime() - left.analysisCreatedAt.getTime();
  }

  return left.analysisRecordId.localeCompare(right.analysisRecordId);
}

function selectDigestCandidates(rows: DigestComposeRow[]): DigestComposeCandidate {
  const latestByContentId = new Map<string, DigestSectionItem>();

  for (const row of rows) {
    if (row.sourceStatus === "blocked") {
      continue;
    }

    if (!hasRenderableSummary(row.summary)) {
      continue;
    }

    if (
      !canEnterDigest({
        contentTraceId: row.contentTraceId,
        evidenceSnippet: row.evidenceSnippet,
        originalUrl: row.originalUrl,
        sourceName: row.sourceName,
        sourceTraceId: row.sourceTraceId,
      })
    ) {
      continue;
    }

    if (!row.contentTraceId || !row.evidenceSnippet || !row.sourceTraceId) {
      continue;
    }

    const contentTraceId = row.contentTraceId;
    const evidenceSnippet = row.evidenceSnippet;
    const sourceTraceId = row.sourceTraceId;

    const item: DigestSectionItem = {
      analysisCreatedAt: row.analysisCreatedAt,
      analysisRecordId: row.analysisRecordId,
      contentEffectiveAt: row.contentEffectiveAt,
      contentId: row.contentId,
      contentTraceId,
      evidenceSnippet,
      originalUrl: row.originalUrl,
      sectionTitle: getSectionTitle(row.categories),
      sourceName: row.sourceName,
      sourceTraceId,
      summary: row.summary,
      title: row.contentTitle?.trim() ? row.contentTitle.trim() : row.originalUrl,
      valueScore: row.valueScore,
    };

    const existing = latestByContentId.get(item.contentId);

    if (!existing || item.analysisCreatedAt.getTime() > existing.analysisCreatedAt.getTime()) {
      latestByContentId.set(item.contentId, item);
    }
  }

  const items = [...latestByContentId.values()].sort(sortDigestItems);
  const grouped = new Map<string, DigestRenderableItem[]>();

  for (const item of items) {
    const sectionItems = grouped.get(item.sectionTitle) ?? [];
    sectionItems.push(item);
    grouped.set(item.sectionTitle, sectionItems);
  }

  const sections = [...grouped.entries()].map(([title, sectionItems]) => ({
    items: sectionItems,
    title,
  }));

  return {
    items,
    sections,
  };
}

async function findLatestSentDigestReport(): Promise<DigestReportRecord | null> {
  const db = getDb();
  const [record] = await db
    .select()
    .from(digestReports)
    .where(and(eq(digestReports.period, "daily"), eq(digestReports.status, "sent")))
    .orderBy(desc(digestReports.sentAt), desc(digestReports.createdAt));

  return record ?? null;
}

async function findDigestReportByDate(digestDate: string): Promise<DigestReportRecord | null> {
  const db = getDb();
  const [record] = await db
    .select()
    .from(digestReports)
    .where(and(eq(digestReports.period, "daily"), eq(digestReports.digestDate, digestDate)));

  return record ?? null;
}

async function collectDigestRows(windowStart: Date, windowEnd: Date): Promise<DigestComposeRow[]> {
  const db = getDb();

  return db
    .select({
      analysisCreatedAt: analysisRecords.createdAt,
      analysisRecordId: analysisRecords.id,
      categories: analysisRecords.categories,
      contentEffectiveAt: contentItems.effectiveAt,
      contentId: contentItems.id,
      contentTitle: contentItems.title,
      contentTraceId: analysisRecords.contentTraceId,
      evidenceSnippet: analysisRecords.evidenceSnippet,
      originalUrl: analysisRecords.originalUrl,
      sourceName: analysisRecords.sourceName,
      sourceStatus: sources.status,
      sourceTraceId: analysisRecords.sourceTraceId,
      summary: analysisRecords.summary,
      valueScore: analysisRecords.valueScore,
    })
    .from(contentItems)
    .innerJoin(sources, eq(sources.id, contentItems.sourceId))
    .innerJoin(analysisRecords, eq(analysisRecords.contentId, contentItems.id))
    .where(
      and(
        gte(contentItems.effectiveAt, windowStart),
        lte(contentItems.effectiveAt, windowEnd),
        eq(analysisRecords.status, "full"),
        ne(sources.status, "blocked"),
      ),
    );
}

async function persistDigest(input: PersistDigestInput): Promise<string> {
  const db = getDb();

  return db.transaction(async (tx) => {
    let digestId = input.existingReport?.id ?? null;

    if (input.existingReport) {
      const updateData: DigestReportUpdate = {
        emailSubject: input.emailSubject,
        markdownBody: input.markdownBody,
        sentAt: null,
        status: "ready",
        windowEnd: input.windowEnd,
        windowStart: input.windowStart,
      };

      await tx.update(digestReports).set(updateData).where(eq(digestReports.id, input.existingReport.id));
      await tx.delete(digestItems).where(eq(digestItems.digestId, input.existingReport.id));
    } else {
      const insertData: NewDigestReport = {
        digestDate: input.digestDate,
        emailSubject: input.emailSubject,
        markdownBody: input.markdownBody,
        period: "daily",
        status: "ready",
        windowEnd: input.windowEnd,
        windowStart: input.windowStart,
      };
      const [createdReport] = await tx.insert(digestReports).values(insertData).returning();

      digestId = requireInsertedRow(createdReport, "digest report").id;
    }

    if (!digestId) {
      throw new Error("[services/digest] Missing digest report id after compose.");
    }

    const itemInserts: NewDigestItem[] = input.digestCandidate.items.map((item, index) => ({
      analysisRecordId: item.analysisRecordId,
      digestId,
      rank: index + 1,
      sectionTitle: item.sectionTitle,
    }));

    if (itemInserts.length > 0) {
      await tx.insert(digestItems).values(itemInserts);
    }

    return digestId;
  });
}

function buildDigestDeps(overrides: DigestComposeDeps): Required<DigestComposeDeps> {
  return {
    appEnv: overrides.appEnv ?? getAppEnv(),
    collectDigestRows: overrides.collectDigestRows ?? collectDigestRows,
    findDigestReportByDate: overrides.findDigestReportByDate ?? findDigestReportByDate,
    findLatestSentDigestReport: overrides.findLatestSentDigestReport ?? findLatestSentDigestReport,
    now: overrides.now ?? (() => new Date()),
    persistDigest: overrides.persistDigest ?? persistDigest,
    renderMarkdown: overrides.renderMarkdown ?? renderDigestMarkdown,
  };
}

function buildPayload(input: {
  digestDate: string;
  digestId: string | null;
  emptyDigest: boolean;
  itemCount: number;
  reusedExistingDigest: boolean;
  skippedBecauseAlreadySent: boolean;
  windowEnd: Date;
  windowStart: Date;
}): DigestComposePayload {
  return {
    digestDate: input.digestDate,
    digestId: input.digestId,
    emptyDigest: input.emptyDigest,
    itemCount: input.itemCount,
    reusedExistingDigest: input.reusedExistingDigest,
    skippedBecauseAlreadySent: input.skippedBecauseAlreadySent,
    windowEnd: input.windowEnd.toISOString(),
    windowStart: input.windowStart.toISOString(),
  };
}

export async function runDigestCompose(
  _jobData: DigestComposeJobData,
  overrides: DigestComposeDeps = {},
): Promise<PipelineStepResult<DigestComposePayload, DigestDeliverJobData>> {
  const deps = buildDigestDeps(overrides);
  const latestSentReport = await deps.findLatestSentDigestReport();
  const { windowEnd, windowStart } = getDigestWindow(
    latestSentReport?.sentAt ?? null,
    deps.appEnv.digestSendHour,
    deps.appEnv.digestTimeZone,
    deps.appEnv.digestMaxLookbackHours,
    deps.now(),
  );
  const digestDate = toDateLabel(windowEnd, deps.appEnv.digestTimeZone);
  const existingReport = await deps.findDigestReportByDate(digestDate);

  if (existingReport?.status === "sent") {
    return createCompletedStepResult({
      message: `digest.compose skipped because ${digestDate} has already been sent`,
      payload: buildPayload({
        digestDate,
        digestId: existingReport.id,
        emptyDigest: false,
        itemCount: 0,
        reusedExistingDigest: false,
        skippedBecauseAlreadySent: true,
        windowEnd,
        windowStart,
      }),
    });
  }

  const digestCandidate = selectDigestCandidates(await deps.collectDigestRows(windowStart, windowEnd));
  const markdownBody = deps.renderMarkdown({
    digestDate,
    sections: digestCandidate.sections,
  });
  const emailSubject = getEmailSubject(digestDate);
  const digestId = await deps.persistDigest({
    digestCandidate,
    digestDate,
    emailSubject,
    existingReport,
    markdownBody,
    windowEnd,
    windowStart,
  });

  const emptyDigest = digestCandidate.items.length === 0;
  const reusedExistingDigest = Boolean(existingReport);

  return createCompletedStepResult({
    message: emptyDigest
      ? `digest.compose prepared empty digest for ${digestDate}`
      : `digest.compose prepared ${digestCandidate.items.length} items for ${digestDate}`,
    nextStep: {
      data: {
        digestId,
        trigger: jobNames.digestCompose,
      },
      jobName: jobNames.digestDeliver,
    },
    payload: buildPayload({
      digestDate,
      digestId,
      emptyDigest,
      itemCount: digestCandidate.items.length,
      reusedExistingDigest,
      skippedBecauseAlreadySent: false,
      windowEnd,
      windowStart,
    }),
  });
}

export type {
  DigestComposeCandidate,
  DigestComposeRow,
  DigestReportRecord,
  DigestSectionItem,
  DigestSummary,
  NewDigestItem,
  NewDigestReport,
  PersistDigestInput,
};
export { getEmailSubject, persistDigest, selectDigestCandidates, toDateLabel };
