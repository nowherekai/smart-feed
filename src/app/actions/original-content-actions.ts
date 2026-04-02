"use server";

import { loadOriginalContentFeed } from "@/app/original-content/query";
import type {
  OriginalContentPageData,
  OriginalContentSearchParams,
  OriginalContentSourceOption,
} from "@/app/original-content/types";
import { db } from "@/db";

export async function getOriginalContentFeed(input: OriginalContentSearchParams): Promise<OriginalContentPageData> {
  return await loadOriginalContentFeed(input);
}

export async function getOriginalContentSources(): Promise<OriginalContentSourceOption[]> {
  const records = await db.query.sources.findMany();

  return records
    .map((source) => {
      const title = source.title?.trim() ? source.title.trim() : source.identifier;

      return {
        id: source.id,
        title,
        identifier: source.identifier,
        label: title,
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label, "en-US"));
}
