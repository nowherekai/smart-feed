"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { type Source, sources } from "@/db/schema";
import { runSourceImport } from "@/services/source-import";

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
    const result = await runSourceImport({
      mode: "opml",
      opml: normalizedOpmlText,
    });

    revalidatePath("/sources");
    revalidatePath("/");

    return {
      status: "completed",
      importRunId: result.importRunId,
      totalCount: result.totalCount,
      createdCount: result.createdCount,
      skippedCount: result.skippedCount,
      failedCount: result.failedCount,
      failedItems: result.items
        .filter((item) => item.result === "failed")
        .map((item) => ({
          inputUrl: item.inputUrl,
          errorMessage: item.errorMessage ?? "Unknown import error.",
        })),
    };
  } catch (error) {
    console.error("Failed to import OPML", error);

    return {
      status: "failed",
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
