import type { Source } from "@/db/schema";

export type SourceListItem = Pick<Source, "id" | "identifier" | "status"> & {
  title: string;
};

export function toSourceListItem(source: Source): SourceListItem {
  return {
    id: source.id,
    title: source.title ?? source.identifier,
    identifier: source.identifier,
    status: source.status,
  };
}
