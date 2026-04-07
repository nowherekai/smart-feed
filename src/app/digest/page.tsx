import { Suspense } from "react";
import { getDailyDigestItems } from "@/app/actions/intelligence-actions";
import { DigestItem } from "@/components/features/digest-item";
import { toDigestItemRecord } from "@/components/features/intelligence-view-model";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

const DIGEST_SKELETON_GROUPS = [
  { key: "digest-group-a", items: ["digest-item-a1", "digest-item-a2"] },
  { key: "digest-group-b", items: ["digest-item-b1", "digest-item-b2"] },
  { key: "digest-group-c", items: ["digest-item-c1", "digest-item-c2"] },
] as const;

export default function DailyDigestPage() {
  return (
    <ScrollArea className="flex-1 w-full h-full">
      <div className="p-8 max-w-4xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-2">
        <div className="text-center space-y-2 mb-12">
          <h3 className="text-3xl font-bold tracking-tight">Daily Intelligence Digest</h3>
          <p className="text-muted-foreground">
            {new Date().toLocaleDateString("zh-CN", {
              timeZone: "Asia/Shanghai",
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        <Suspense fallback={<DailyDigestFallback />}>
          <DailyDigestSections />
        </Suspense>
      </div>
    </ScrollArea>
  );
}

async function DailyDigestSections() {
  const records = await getDailyDigestItems();
  const digestRecords = records.flatMap((record) => toDigestItemRecord(record) ?? []);

  if (digestRecords.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No digest generated yet. Wait for the scheduled task or trigger manually.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {digestRecords.map((item) => (
        <DigestItem key={item.id} record={item} />
      ))}
    </div>
  );
}

function DailyDigestFallback() {
  return (
    <div className="space-y-8">
      {DIGEST_SKELETON_GROUPS.flatMap((group) =>
        group.items.map((itemKey) => (
          <div key={itemKey} className="space-y-3 border-l-2 border-border/50 pl-8 py-2">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        )),
      )}
    </div>
  );
}
