"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Clock } from "lucide-react";
import { IntelligenceCard } from "@/components/features/intelligence-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useFeedStore } from "@/lib/store";

export default function DashboardPage() {
  const analysisRecords = useFeedStore((state) => state.analysisRecords);

  return (
    <ScrollArea className="flex-1 w-full h-full">
      <AnimatePresence mode="wait">
        <motion.div
          key="dashboard"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="p-8 max-w-5xl mx-auto space-y-8"
        >
          <section>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold tracking-tight">Top Intelligence</h3>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock size={14} />
                Updated 12m ago
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
        </motion.div>
      </AnimatePresence>
    </ScrollArea>
  );
}
