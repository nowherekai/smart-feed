import { Calendar, FileText } from "lucide-react";
import Link from "next/link";
import { getDigestArchives } from "@/app/actions/digest-archive-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function formatDigestDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("zh-CN", {
    weekday: "short",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export default async function DigestArchivePage() {
  const archives = await getDigestArchives();

  return (
    <ScrollArea className="flex-1 w-full h-full">
      <div className="p-8 max-w-4xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-2">
        <div className="text-center space-y-2 mb-12">
          <h3 className="text-3xl font-bold tracking-tight">Digest Archive</h3>
          <p className="text-muted-foreground">Historical daily intelligence reports</p>
        </div>

        {archives.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
            <FileText className="w-8 h-8 mx-auto mb-4 opacity-50" />
            <p>No historical digests available.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {archives.map((archive) => (
              <Link key={archive.id} href={`/digests/${archive.digestDate}`}>
                <Card className="hover:border-primary/50 transition-colors border-border bg-card/80 shadow-sm cursor-pointer group">
                  <CardContent className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                        <Calendar className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                          {archive.digestDate}
                        </h4>
                        <p className="text-sm text-muted-foreground">{formatDigestDate(archive.digestDate)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className={cn(
                          archive.status === "sent"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                            : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
                        )}
                      >
                        {archive.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
