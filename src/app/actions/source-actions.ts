"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { type Source, sources } from "@/db/schema";
import {
  enqueueOpmlSourceImport,
  getSourceImportRunProgress,
  runSourceImport,
  type SourceImportRunProgress,
} from "@/services/source-import";

export type AddSourceResult =
  | {
      status: "created";
      message: string;
      normalizedUrl: string;
      sourceId: string;
    }
  | {
      status: "skipped_duplicate";
      message: string;
      normalizedUrl: string;
      sourceId: string;
    }
  | {
      status: "failed";
      message: string;
    };

export type OpmlImportFailedItem = {
  inputUrl: string;
  errorMessage: string;
};

export type ImportSourcesFromOpmlResult =
  | {
      status: "queued";
      importRunId: string;
      totalCount: number;
      createdCount: number;
      skippedCount: number;
      failedCount: number;
      failedItems: OpmlImportFailedItem[];
    }
  | {
      status: "completed";
      importRunId: string;
      totalCount: number;
      createdCount: number;
      skippedCount: number;
      failedCount: number;
      failedItems: OpmlImportFailedItem[];
    }
  | {
      status: "failed";
      message: string;
    };

export type SourceImportRunStatusResult =
  | {
      status: "pending" | "running" | "completed";
      importRunId: string;
      totalCount: number;
      processedCount: number;
      createdCount: number;
      skippedCount: number;
      failedCount: number;
      failedItems: OpmlImportFailedItem[];
    }
  | {
      status: "failed";
      importRunId: string;
      totalCount: number;
      processedCount: number;
      createdCount: number;
      skippedCount: number;
      failedCount: number;
      failedItems: OpmlImportFailedItem[];
      message: string;
    }
  | {
      status: "not_found";
      message: string;
    };

export async function getSources(): Promise<Source[]> {
  const result = await db.query.sources.findMany({
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  return result;
}

function toFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Failed to add source.";
}

function toOpmlRunSummary(progress: SourceImportRunProgress) {
  return {
    importRunId: progress.importRunId,
    totalCount: progress.totalCount,
    processedCount: progress.processedCount,
    createdCount: progress.createdCount,
    skippedCount: progress.skippedCount,
    failedCount: progress.failedCount,
    failedItems: progress.failedItems,
  };
}

export async function addSource(url: string): Promise<AddSourceResult> {
  try {
    const result = await runSourceImport({
      mode: "single",
      url,
    });
    const outcome = result.items[0];

    if (!outcome) {
      return {
        status: "failed",
        message: "Failed to add source.",
      };
    }

    if (outcome.result === "failed") {
      return {
        status: "failed",
        message: outcome.errorMessage ?? "Failed to add source.",
      };
    }

    if (!outcome.normalizedUrl || !outcome.sourceId) {
      return {
        status: "failed",
        message: "Failed to add source.",
      };
    }

    revalidatePath("/sources");
    revalidatePath("/");

    return {
      status: outcome.result,
      message: outcome.result === "created" ? "Source added." : "Source already exists.",
      normalizedUrl: outcome.normalizedUrl,
      sourceId: outcome.sourceId,
    };
  } catch (error) {
    console.error("Failed to add source", error);

    return {
      status: "failed",
      message: toFailureMessage(error),
    };
  }
}

export async function importSourcesFromOpml(opmlText: string): Promise<ImportSourcesFromOpmlResult> {
  const normalizedOpmlText = opmlText.trim();

  if (!normalizedOpmlText) {
    return {
      status: "failed",
      message: "OPML file is empty.",
    };
  }

  try {
    const result = await enqueueOpmlSourceImport(normalizedOpmlText);

    return {
      status: "queued",
      importRunId: result.importRunId,
      totalCount: result.totalCount,
      createdCount: 0,
      skippedCount: 0,
      failedCount: 0,
      failedItems: [],
    };
  } catch (error) {
    console.error("Failed to import OPML", error);

    return {
      status: "failed",
      message: toFailureMessage(error),
    };
  }
}

export async function getOpmlImportRunStatus(importRunId: string): Promise<SourceImportRunStatusResult> {
  try {
    const progress = await getSourceImportRunProgress(importRunId);

    if (!progress) {
      return {
        status: "not_found",
        message: "导入运行不存在。",
      };
    }

    if (progress.status === "completed") {
      revalidatePath("/sources");
      revalidatePath("/");
      return {
        status: "completed",
        ...toOpmlRunSummary(progress),
      };
    }

    if (progress.status === "failed") {
      revalidatePath("/sources");
      revalidatePath("/");
      return {
        status: "failed",
        ...toOpmlRunSummary(progress),
        message: "OPML 导入失败，请查看服务端日志。",
      };
    }

    return {
      status: progress.status,
      ...toOpmlRunSummary(progress),
    };
  } catch (error) {
    console.error("Failed to query OPML import run", error);

    return {
      status: "not_found",
      message: toFailureMessage(error),
    };
  }
}

export async function toggleSourceStatus(id: string, currentStatus: "active" | "paused" | "blocked") {
  const newStatus = currentStatus === "active" ? "paused" : "active";
  await db.update(sources).set({ status: newStatus }).where(eq(sources.id, id));

  revalidatePath("/sources");
}

export async function removeSource(id: string) {
  try {
    await db.delete(sources).where(eq(sources.id, id));
    revalidatePath("/sources");
    revalidatePath("/");
    return { success: true };
  } catch (err: unknown) {
    console.error("Failed to cleanly delete source", err);
    return { success: false, error: "Failed to delete source. It may have associated content." };
  }
}
