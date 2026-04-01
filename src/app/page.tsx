import { Clock } from "lucide-react";
import { getTopIntelligence } from "@/app/actions/intelligence-actions";
import { IntelligenceCard } from "@/components/features/intelligence-card";
import { ScrollArea } from "@/components/ui/scroll-area";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const analysisRecords = await getTopIntelligence();

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

          {analysisRecords.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground bg-muted/10 rounded-xl border border-dashed border-border">
              No intelligence ready yet. Check back later or add more sources.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {analysisRecords.map((record) => (
                <IntelligenceCard key={record.id} record={record} />
              ))}
            </div>
          )}
        </section>
      </div>
    </ScrollArea>
  );
}
