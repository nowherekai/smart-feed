import { sql } from "drizzle-orm";
import type { AnalysisListItem, AnalysisPageData, AnalysisSearchParams } from "@/app/analysis/types";
import { getAppEnv } from "@/config";
import { db } from "@/db";
import type { AnalysisSummary } from "@/db/schema";
import { createLogger } from "@/utils/logger";

const logger = createLogger("AnalysisQuery");

const ANALYSIS_PAGE_SIZE = 20;

/**
 * 解析并规范化 Analysis 页面的 URL 参数
 */
function normalizeAnalysisParams(input: AnalysisSearchParams): { page: number } {
  const rawPage = typeof input.page === "string" ? input.page : Array.isArray(input.page) ? input.page[0] : undefined;
  const parsed = rawPage ? Number.parseInt(rawPage, 10) : Number.NaN;

  return {
    page: Number.isInteger(parsed) && parsed > 0 ? parsed : 1,
  };
}

function getTotalPages(totalItems: number, pageSize = ANALYSIS_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(page, 1), totalPages);
}

/**
 * 去重子查询 SQL：
 * 使用 PostgreSQL DISTINCT ON 按 content_id 去重，
 * 优先选择 status='full' 的记录，然后按 created_at 降序
 */
const deduplicatedSubquery = sql`
  SELECT DISTINCT ON (content_id) *
  FROM analysis_records
  WHERE summary IS NOT NULL
  ORDER BY content_id,
    CASE WHEN status = 'full' THEN 0 ELSE 1 END,
    created_at DESC
`;

/** 去重后的原始行类型（snake_case，对应 DB 列名） */
type DeduplicatedRow = {
  id: string;
  content_id: string;
  categories: string[];
  keywords: string[];
  value_score: number;
  status: "basic" | "full";
  summary: AnalysisSummary;
  source_name: string;
  original_url: string;
  created_at: string;
};

/**
 * 查询去重后的记录总数
 */
async function countDeduplicatedRecords(): Promise<number> {
  const result = await db.execute<{ count: string }>(sql`
    SELECT count(*) as count
    FROM (${deduplicatedSubquery}) AS deduped
  `);

  // db.execute 返回 RowList（类数组），直接按索引访问
  const firstRow = result[0];
  return Number(firstRow?.count ?? 0);
}

/**
 * 查询去重后的分页记录
 */
async function fetchDeduplicatedRecords(limit: number, offset: number): Promise<DeduplicatedRow[]> {
  const result = await db.execute<DeduplicatedRow>(sql`
    SELECT id, content_id, categories, keywords, value_score, status,
           summary, source_name, original_url, created_at
    FROM (${deduplicatedSubquery}) AS deduped
    ORDER BY value_score DESC, created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  // db.execute 返回 RowList（类数组），转为普通数组
  return Array.from(result);
}

/**
 * 加载 Analysis 页面数据（去重 + 分页）
 */
export async function loadAnalysisFeed(input: AnalysisSearchParams): Promise<AnalysisPageData> {
  const timeZone = getAppEnv().timeZone;
  const { page: requestedPage } = normalizeAnalysisParams(input);

  logger.info("Loading analysis feed", { requestedPage });

  try {
    const totalItems = await countDeduplicatedRecords();
    const totalPages = getTotalPages(totalItems);
    const page = clampPage(requestedPage, totalPages);
    const offset = (page - 1) * ANALYSIS_PAGE_SIZE;

    const rows = await fetchDeduplicatedRecords(ANALYSIS_PAGE_SIZE, offset);

    const items: AnalysisListItem[] = rows.map((row) => ({
      id: row.id,
      contentId: row.content_id,
      categories: row.categories ?? [],
      keywords: row.keywords ?? [],
      valueScore: row.value_score,
      status: row.status,
      summary: row.summary,
      sourceName: row.source_name,
      originalUrl: row.original_url,
      createdAt: new Date(row.created_at),
    }));

    logger.info("Loaded analysis feed", {
      page,
      totalItems,
      totalPages,
      itemCount: items.length,
    });

    return {
      items,
      page,
      pageSize: ANALYSIS_PAGE_SIZE,
      totalItems,
      totalPages,
      timeZone,
    };
  } catch (error) {
    logger.error("Failed to load analysis feed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
