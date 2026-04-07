import { loadStatsPageData } from "@/app/stats/query";
import { StatsClient } from "@/app/stats/stats-client";
import type { StatsSearchParams } from "@/app/stats/types";
import { ScrollArea } from "@/components/ui/scroll-area";

export const dynamic = "force-dynamic";

type StatsPageProps = {
  searchParams: Promise<StatsSearchParams>;
};

export default async function StatsPage({ searchParams }: StatsPageProps) {
  const resolvedSearchParams = await searchParams;
  const data = await loadStatsPageData(resolvedSearchParams);

  return (
    <ScrollArea className="flex-1 h-full w-full">
      <StatsClient data={data} />
    </ScrollArea>
  );
}
