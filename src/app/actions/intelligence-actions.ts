"use server";

import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { type AnalysisRecord, analysisRecords } from "@/db/schema";
import { createLogger } from "@/utils/logger";

const logger = createLogger("IntelligenceActions");

export async function getTopIntelligence(): Promise<AnalysisRecord[]> {
  return await db.query.analysisRecords.findMany({
    where: isNotNull(analysisRecords.summary),
    orderBy: [desc(analysisRecords.valueScore), desc(analysisRecords.createdAt)],
    limit: 10,
  });
}

export async function getDailyDigestItems(): Promise<AnalysisRecord[]> {
  logger.info("Loading daily digest items");

  try {
    // 只获取完整分析(status=full)的记录，按价值评分和时间排序
    const records = await db.query.analysisRecords.findMany({
      where: and(eq(analysisRecords.status, "full"), isNotNull(analysisRecords.summary)),
      orderBy: [desc(analysisRecords.valueScore), desc(analysisRecords.createdAt)],
      limit: 50,
    });

    logger.info("Loaded daily digest items", { count: records.length });

    return records;
  } catch (error) {
    logger.error("Failed to load daily digest items", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
