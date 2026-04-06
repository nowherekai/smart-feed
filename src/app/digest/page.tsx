import { Suspense } from "react";
import { getDailyDigestItems } from "@/app/actions/intelligence-actions";
import { DigestItem } from "@/components/features/digest-item";
import { toDigestItemRecord } from "@/components/features/intelligence-view-model";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
  const groupedCategories = groupDigestRecords(records);

  if (groupedCategories.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No digest generated yet. Wait for the scheduled task or trigger manually.
      </div>
    );
  }

  return (
    <div className="space-y-16">
      {groupedCategories.map(({ category, items }) => (
        <section key={category} className="space-y-8">
          <div className="flex items-center gap-4">
            <h4 className="shrink-0 text-lg font-bold uppercase tracking-widest text-primary">{category}</h4>
            <Separator className="flex-1" />
          </div>
          <div className="space-y-8">
            {items.map((item) => (
              <DigestItem key={`${category}-${item.id}`} record={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function groupDigestRecords(records: Awaited<ReturnType<typeof getDailyDigestItems>>) {
  const grouped = new Map<string, NonNullable<ReturnType<typeof toDigestItemRecord>>[]>();

  for (const record of records) {
    const digestRecord = toDigestItemRecord(record);

    if (!digestRecord) {
      continue;
    }

    const categories = record.categories.length > 0 ? record.categories : ["未分类"];

    for (const category of categories) {
      const normalizedCategory = category.trim() || "未分类";
      const categoryItems = grouped.get(normalizedCategory);

      if (categoryItems) {
        categoryItems.push(digestRecord);
        continue;
      }

      grouped.set(normalizedCategory, [digestRecord]);
    }
  }

  return Array.from(grouped.entries()).map(([category, items]) => ({
    category,
    items,
  }));
}

function DailyDigestFallback() {
  return (
    <div className="space-y-16">
      {DIGEST_SKELETON_GROUPS.map((group) => (
        <section key={group.key} className="space-y-8">
          <div className="flex items-center gap-4">
            <Skeleton className="h-5 w-24" />
            <Separator className="flex-1" />
          </div>
          <div className="space-y-8">
            {group.items.map((itemKey) => (
              <div key={itemKey} className="space-y-3 border-l-2 border-border/50 pl-8 py-2">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
