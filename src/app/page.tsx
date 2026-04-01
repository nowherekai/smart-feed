import { Clock } from "lucide-react";
import { Suspense } from "react";
import { getTopIntelligence } from "@/app/actions/intelligence-actions";
import { IntelligenceCard } from "@/components/features/intelligence-card";
import { toIntelligenceCardRecord } from "@/components/features/intelligence-view-model";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

const DASHBOARD_SKELETON_KEYS = ["dashboard-a", "dashboard-b", "dashboard-c", "dashboard-d"] as const;

export default function DashboardPage() {
  return (
    <ScrollArea className="flex-1 w-full h-full">
      <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-2">
        <section>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold tracking-tight">Top Intelligence</h3>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock size={14} />
              Real-time update
            </div>
          </div>

          <Suspense fallback={<DashboardCardsFallback />}>
            <DashboardCards />
          </Suspense>
        </section>
      </div>
    </ScrollArea>
  );
}

async function DashboardCards() {
  const analysisRecords = await getTopIntelligence();
  const records = analysisRecords.map(toIntelligenceCardRecord).filter((record) => record !== null);

  return records.length === 0 ? (
    <div className="text-center py-12 text-muted-foreground bg-muted/10 rounded-xl border border-dashed border-border">
      No intelligence ready yet. Check back later or add more sources.
    </div>
  ) : (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {records.map((record) => (
        <IntelligenceCard key={record.id} record={record} />
      ))}
    </div>
  );
}

function DashboardCardsFallback() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {DASHBOARD_SKELETON_KEYS.map((key) => (
        <div key={key} className="rounded-xl border border-border p-4 space-y-4">
          <Skeleton className="h-1.5 w-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-4/5" />
            <Skeleton className="h-4 w-1/3" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}
