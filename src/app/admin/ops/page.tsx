import { OpsClient } from "@/app/admin/ops/ops-client";
import { loadOpsInsightsPageData } from "@/app/admin/ops/query";
import type { OpsSearchParams } from "@/app/admin/ops/types";
import { ScrollArea } from "@/components/ui/scroll-area";

export const dynamic = "force-dynamic";

type OpsPageProps = {
  searchParams: Promise<OpsSearchParams>;
};

export default async function OpsPage({ searchParams }: OpsPageProps) {
  const resolvedSearchParams = await searchParams;
  const data = await loadOpsInsightsPageData(resolvedSearchParams);

  return (
    <ScrollArea className="h-full w-full flex-1">
      <OpsClient data={data} />
    </ScrollArea>
  );
}
