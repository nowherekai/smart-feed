"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { type Source, sources } from "@/db/schema";

export async function getSources(): Promise<Source[]> {
  const result = await db.query.sources.findMany({
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  return result;
}

export async function addSource(url: string, title: string) {
  await db.insert(sources).values({
    type: "rss-source",
    identifier: url,
    title: title,
    status: "active",
    weight: 1.0,
  });

  revalidatePath("/sources");
  revalidatePath("/");
}

export async function toggleSourceStatus(id: string, currentStatus: "active" | "paused" | "blocked") {
  const newStatus = currentStatus === "active" ? "paused" : "active";
  await db.update(sources).set({ status: newStatus }).where(eq(sources.id, id));

  revalidatePath("/sources");
}

export async function removeSource(id: string) {
  try {
    await db.delete(sources).where(eq(sources.id, id));
  } catch (err: unknown) {
    // Foreign key constraint failure likely if a source has crawled content.
    // In strict applications we might soft delete, but per specs we attempt a hard delete.
    console.error("Failed to cleanly delete source", err);
  }
  revalidatePath("/sources");
  revalidatePath("/");
}
