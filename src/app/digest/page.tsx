import { getDailyDigestItems } from "@/app/actions/intelligence-actions";
import { DigestItem } from "@/components/features/digest-item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export const dynamic = "force-dynamic";

export default async function DailyDigestPage() {
  const analysisRecords = await getDailyDigestItems();

  const groupedCategories = (() => {
    const map = new Map<string, typeof analysisRecords>();
    for (const r of analysisRecords) {
      if (!r.categories || r.categories.length === 0) continue;
      for (const c of r.categories) {
        let list = map.get(c);
        if (!list) {
          list = [];
          map.set(c, list);
        }
        list.push(r);
      }
    }
    return Array.from(map.entries()).map(([category, items]) => ({ category, items }));
  })();

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

        <div className="space-y-16">
          {groupedCategories.map(({ category, items }) => {
            if (items.length === 0) return null;

            return (
              <section key={category} className="space-y-8">
                <div className="flex items-center gap-4">
                  <h4 className="text-lg font-bold uppercase tracking-widest text-primary shrink-0">{category}</h4>
                  <Separator className="flex-1" />
                </div>
                <div className="space-y-8">
                  {items.map((item) => (
                    <DigestItem key={item.id} record={item} />
                  ))}
                </div>
              </section>
            );
          })}

          {groupedCategories.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No digest generated yet. Wait for the scheduled task or trigger manually.
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
