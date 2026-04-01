/**
 * 摘要编排服务模块
 * 负责日报（Daily Digest）的生成与编排逻辑。
 * 包含：动态统计窗口计算、多条件内容筛选（时间、评分、可追溯性）、内容自动分组、Markdown 渲染及数据库事务持久化。
 */

import { and, desc, eq, gte, lte, ne } from "drizzle-orm";

import { type AppEnv, getAppEnv } from "../config";
import { type AnalysisSummary, analysisRecords, contentItems, digestItems, digestReports, getDb, sources } from "../db";
import { createCompletedStepResult, type PipelineStepResult } from "../pipeline/types";
import { smartFeedTaskNames } from "../queue";
import { getDigestWindow } from "../utils";
import { type DigestRenderableItem, type DigestRenderSection, renderDigestMarkdown } from "./digest-renderer";
import { canEnterDigest } from "./traceability";

// 类型定义
type DigestReportRecord = typeof digestReports.$inferSelect;
type NewDigestReport = typeof digestReports.$inferInsert;
type DigestReportUpdate = Partial<Omit<NewDigestReport, "id">>;
type NewDigestItem = typeof digestItems.$inferInsert;

type DigestSummary = AnalysisSummary;

/** 原始数据库查询行结果结构 */
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

/** 编排后的条目结构，增加了 sectionTitle */
type DigestSectionItem = DigestRenderableItem & {
  analysisCreatedAt: Date;
  analysisRecordId: string;
  contentEffectiveAt: Date;
  contentId: string;
  sectionTitle: string;
  valueScore: number;
};

/** 编排候选集：包含排序后的扁平列表和分组后的渲染结构 */
type DigestComposeCandidate = {
  items: DigestSectionItem[];
  sections: DigestRenderSection[];
};

/** 持久化输入参数 */
type PersistDigestInput = {
  digestCandidate: DigestComposeCandidate;
  digestDate: string;
  emailSubject: string;
  existingReport: DigestReportRecord | null;
  markdownBody: string;
  windowEnd: Date;
  windowStart: Date;
};

/** 编排任务输入数据 */
export type DigestComposeJobData = {
  pipelineRunId?: string;
  trigger: "manual" | "scheduler";
};

/** 投递任务输入数据 */
export type DigestDeliverJobData = {
  digestId: string;
  pipelineRunId?: string;
  trigger: "manual" | "scheduler" | "digest.compose";
};

/** 编排执行业务载荷 */
export type DigestComposePayload = {
  /** 报告日期标签 (YYYY-MM-DD) */
  digestDate: string;
  /** 生成的报告 ID */
  digestId: string | null;
  /** 是否是空报告（无高价值内容） */
  emptyDigest: boolean;
  /** 包含的内容条目总数 */
  itemCount: number;
  /** 是否复用了已有的草稿记录 */
  reusedExistingDigest: boolean;
  /** 是否因已发送而跳过 */
  skippedBecauseAlreadySent: boolean;
  /** 统计窗口结束 ISO 字符串 */
  windowEnd: string;
  /** 统计窗口开始 ISO 字符串 */
  windowStart: string;
};

// 依赖项
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

/** 格式化本地日期标签 (YYYY-MM-DD) */
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

/** 生成邮件主题 */
function getEmailSubject(digestDate: string): string {
  return `[smart-feed] 日报 ${digestDate}`;
}

/** 摘要合法性预检 */
function hasRenderableSummary(summary: DigestSummary | null): summary is DigestSummary {
  return Boolean(
    summary &&
      typeof summary.oneline === "string" &&
      typeof summary.reason === "string" &&
      Array.isArray(summary.points) &&
      summary.points.length > 0,
  );
}

/** 根据分类数组获取主分类标题 */
function getSectionTitle(categories: string[]): string {
  const primaryCategory = categories[0]?.trim();
  return primaryCategory ? primaryCategory : "未分类";
}

/**
 * 编排排序逻辑
 * 1. 价值评分 (valueScore) 降序。
 * 2. 业务时间 (contentEffectiveAt) 降序。
 * 3. 分析时间 (analysisCreatedAt) 降序。
 */
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

/**
 * 筛选与分组逻辑
 * 1. 排除 blocked 来源。
 * 2. 必须有完整摘要。
 * 3. 必须通过可追溯性校验 (Traceability)。
 * 4. 同一篇内容若有多次分析，取最新的一条。
 * 5. 按主分类分组。
 */
function selectDigestCandidates(rows: DigestComposeRow[]): DigestComposeCandidate {
  const latestByContentId = new Map<string, DigestSectionItem>();

  for (const row of rows) {
    if (row.sourceStatus === "blocked") {
      continue;
    }

    if (!hasRenderableSummary(row.summary)) {
      continue;
    }

    // 可追溯性校验
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

    const item: DigestSectionItem = {
      analysisCreatedAt: row.analysisCreatedAt,
      analysisRecordId: row.analysisRecordId,
      contentEffectiveAt: row.contentEffectiveAt,
      contentId: row.contentId,
      contentTraceId: row.contentTraceId,
      evidenceSnippet: row.evidenceSnippet,
      originalUrl: row.originalUrl,
      sectionTitle: getSectionTitle(row.categories),
      sourceName: row.sourceName,
      sourceTraceId: row.sourceTraceId,
      summary: row.summary,
      title: row.contentTitle?.trim() ? row.contentTitle.trim() : row.originalUrl,
      valueScore: row.valueScore,
    };

    const existing = latestByContentId.get(item.contentId);

    // 同一内容去重，保留最新分析结果
    if (!existing || item.analysisCreatedAt.getTime() > existing.analysisCreatedAt.getTime()) {
      latestByContentId.set(item.contentId, item);
    }
  }

  // 排序
  const items = [...latestByContentId.values()].sort(sortDigestItems);

  // 按分类标题进行物理分组用于渲染
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

// --- 数据库查询 ---

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

/** 收集窗口内所有符合条件的分析记录 */
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
        eq(analysisRecords.status, "full"), // 必须是完整的深度摘要
        ne(sources.status, "blocked"), // 排除已屏蔽来源
      ),
    );
}

/**
 * 摘要持久化原子操作 (事务)
 * 1. 若已有今日草稿，则更新元数据并清空旧条目。
 * 2. 若无，创建新的 DigestReport。
 * 3. 批量插入 DigestItem 记录文章关联。
 */
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

    // 批量插入关联条目
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

/**
 * 摘要编排任务核心逻辑 (Task 6)
 * 1. 计算统计区间：[max(上次成功发送时间, 24h前), 现在本地8点]。
 * 2. 幂等检查：若今日日报已处于 sent 状态，则跳过生成。
 * 3. 数据收集：获取区间内所有 status='full' 的分析记录。
 * 4. 编排处理：执行筛选、去重、排序及分组。
 * 5. 渲染：将分组后的数据渲染为 Markdown 正文。
 * 6. 存储：原子化写入数据库 (digest_reports + digest_items)。
 * 7. 完成后入队下一步：摘要投递 (digest.deliver)。
 */
export async function runDigestCompose(
  _jobData: DigestComposeJobData,
  overrides: DigestComposeDeps = {},
): Promise<PipelineStepResult<DigestComposePayload, DigestDeliverJobData>> {
  const deps = buildDigestDeps(overrides);

  // 1. 获取统计区间
  const latestSentReport = await deps.findLatestSentDigestReport();
  const { windowEnd, windowStart } = getDigestWindow(
    latestSentReport?.sentAt ?? null,
    deps.appEnv.digestSendHour,
    deps.appEnv.digestTimeZone,
    deps.appEnv.digestMaxLookbackHours,
    deps.now(),
  );
  const digestDate = toDateLabel(windowEnd, deps.appEnv.digestTimeZone);

  // 2. 幂等性检查
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

  // 3. 执行核心编排
  const digestCandidate = selectDigestCandidates(await deps.collectDigestRows(windowStart, windowEnd));

  // 4. 渲染 Markdown
  const markdownBody = deps.renderMarkdown({
    digestDate,
    sections: digestCandidate.sections,
  });
  const emailSubject = getEmailSubject(digestDate);

  // 5. 持久化
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

  // 6. 入队投递任务
  return createCompletedStepResult({
    message: emptyDigest
      ? `digest.compose prepared empty digest for ${digestDate}`
      : `digest.compose prepared ${digestCandidate.items.length} items for ${digestDate}`,
    nextStep: {
      data: {
        digestId,
        trigger: smartFeedTaskNames.digestCompose,
      },
      jobName: smartFeedTaskNames.digestDeliver,
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
