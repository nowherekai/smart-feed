"use server";

import { desc, isNotNull } from "drizzle-orm";
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
  // Typical dashboard digest might show records in the latest window that are high value.
  return await db.query.analysisRecords.findMany({
    where: isNotNull(analysisRecords.summary),
    orderBy: [desc(analysisRecords.createdAt), desc(analysisRecords.valueScore)],
    limit: 50,
  });
}
