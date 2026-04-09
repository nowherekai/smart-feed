"use server";

import { and, asc, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { digestReports } from "@/db/schema";
import { createLogger } from "@/utils/logger";

const logger = createLogger("DigestArchiveActions");

export async function getDigestArchives() {
  logger.info("Loading digest archives");
  return await db.query.digestReports.findMany({
    columns: {
      id: true,
      digestDate: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
    where: and(eq(digestReports.period, "daily"), inArray(digestReports.status, ["ready", "sent"])),
    orderBy: [desc(digestReports.digestDate)],
  });
}

export async function getDigestArchiveDetail(date: string) {
  logger.info("Loading digest archive detail", { date });
  const [current] = await db.query.digestReports.findMany({
    where: and(eq(digestReports.period, "daily"), eq(digestReports.digestDate, date)),
    limit: 1,
  });

  if (!current || !["ready", "sent"].includes(current.status) || !current.markdownBody) {
    return null;
  }

  const [prev] = await db.query.digestReports.findMany({
    columns: { digestDate: true },
    where: and(
      eq(digestReports.period, "daily"),
      inArray(digestReports.status, ["ready", "sent"]),
      lt(digestReports.digestDate, date),
    ),
    orderBy: [desc(digestReports.digestDate)],
    limit: 1,
  });

  const [next] = await db.query.digestReports.findMany({
    columns: { digestDate: true },
    where: and(
      eq(digestReports.period, "daily"),
      inArray(digestReports.status, ["ready", "sent"]),
      gt(digestReports.digestDate, date),
    ),
    orderBy: [asc(digestReports.digestDate)],
    limit: 1,
  });

  return {
    current,
    prevDate: prev?.digestDate ?? null,
    nextDate: next?.digestDate ?? null,
  };
}
