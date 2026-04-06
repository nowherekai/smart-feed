"use server";

import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { type AnalysisRecord, analysisRecords } from "@/db/schema";

export async function getTopIntelligence(): Promise<AnalysisRecord[]> {
  return await db.query.analysisRecords.findMany({
    where: isNotNull(analysisRecords.summary),
    orderBy: [desc(analysisRecords.valueScore), desc(analysisRecords.createdAt)],
    limit: 10,
  });
}

export async function getDailyDigestItems(): Promise<AnalysisRecord[]> {
  // 只获取完整分析(status=full)的记录，按价值评分和时间排序
  return await db.query.analysisRecords.findMany({
    where: and(eq(analysisRecords.status, "full"), isNotNull(analysisRecords.summary)),
    orderBy: [desc(analysisRecords.valueScore), desc(analysisRecords.createdAt)],
    limit: 50,
  });
}
