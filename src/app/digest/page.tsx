"use client";

import { AnimatePresence, motion } from "framer-motion";
import { DigestItem } from "@/components/features/digest-item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useFeedStore } from "@/lib/store";

export default function DailyDigestPage() {
  const analysisRecords = useFeedStore((state) => state.analysisRecords);

  // Group by category assuming the first category is primary
  const getCategories = () => {
    const categories = new Set<string>();
    for (const r of analysisRecords) {
      for (const c of r.category) {
        categories.add(c);
      }
    }
    return Array.from(categories);
  };

  const categories = getCategories();

  return (
    <ScrollArea className="flex-1 w-full h-full">
      <AnimatePresence mode="wait">
        <motion.div
          key="digest"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="p-8 max-w-4xl mx-auto space-y-12"
        >
          <div className="text-center space-y-2 mb-12">
            <h3 className="text-3xl font-bold tracking-tight">Daily Intelligence Digest</h3>
            <p className="text-muted-foreground">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>

          <div className="space-y-16">
            {categories.map((category) => {
              const items = analysisRecords.filter((r) => r.category.includes(category));
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

            {categories.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                No digest generated yet. Wait for the scheduled task or trigger manually.
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </ScrollArea>
  );
}
