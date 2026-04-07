import { getAnalysisFeed } from "@/app/actions/intelligence-actions";
import { AnalysisClient } from "@/app/analysis/analysis-client";
import type { AnalysisSearchParams } from "@/app/analysis/types";
import { ScrollArea } from "@/components/ui/scroll-area";

export const dynamic = "force-dynamic";

type AnalysisPageProps = {
  searchParams: Promise<AnalysisSearchParams>;
};

export default async function AnalysisPage({ searchParams }: AnalysisPageProps) {
  const resolvedSearchParams = await searchParams;
  const data = await getAnalysisFeed(resolvedSearchParams);

  return (
    <ScrollArea className="flex-1 h-full w-full">
      <AnalysisClient data={data} />
    </ScrollArea>
  );
}
