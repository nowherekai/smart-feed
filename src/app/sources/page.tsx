import { Suspense } from "react";
import { getSources } from "@/app/actions/source-actions";
import { SourcesClient } from "@/app/sources/sources-client";
import { toSourceListItem } from "@/app/sources/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

const SOURCES_SKELETON_KEYS = ["source-a", "source-b", "source-c", "source-d", "source-e", "source-f"] as const;

export default function SourcesPage() {
  return (
    <ScrollArea className="flex-1 w-full h-full">
      <Suspense fallback={<SourcesPageFallback />}>
        <SourcesPageContent />
      </Suspense>
    </ScrollArea>
  );
}

async function SourcesPageContent() {
  const sources = await getSources();

  return <SourcesClient initialSources={sources.map(toSourceListItem)} />;
}

function SourcesPageFallback() {
  return (
    <div className="p-8 mx-auto max-w-5xl space-y-8 animate-in fade-in slide-in-from-bottom-2">
      <div className="space-y-4 rounded-xl border border-border p-6">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72" />
        <div className="space-y-4">
          <div className="flex gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-28" />
          </div>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {SOURCES_SKELETON_KEYS.map((key) => (
          <div key={key} className="space-y-4 rounded-xl border border-border p-4">
            <div className="flex items-start justify-between">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="size-8" />
            </div>
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
