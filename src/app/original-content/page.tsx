import { getOriginalContentFeed, getOriginalContentSources } from "@/app/actions/original-content-actions";
import { OriginalContentClient } from "@/app/original-content/original-content-client";
import type { OriginalContentSearchParams } from "@/app/original-content/types";
import { ScrollArea } from "@/components/ui/scroll-area";

export const dynamic = "force-dynamic";

type OriginalContentPageProps = {
  searchParams: Promise<OriginalContentSearchParams>;
};

export default async function OriginalContentPage({ searchParams }: OriginalContentPageProps) {
  const resolvedSearchParams = await searchParams;
  const [data, sources] = await Promise.all([
    getOriginalContentFeed(resolvedSearchParams),
    getOriginalContentSources(),
  ]);

  return (
    <ScrollArea className="flex-1 h-full w-full">
      <OriginalContentClient data={data} sources={sources} />
    </ScrollArea>
  );
}
