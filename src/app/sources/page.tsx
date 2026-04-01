import { getSources } from "@/app/actions/source-actions";
import { SourcesClient } from "@/app/sources/sources-client";
import { ScrollArea } from "@/components/ui/scroll-area";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const sources = await getSources();

  return (
    <ScrollArea className="flex-1 w-full h-full">
      <SourcesClient initialSources={sources} />
    </ScrollArea>
  );
}
