import { CalendarDays, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { OriginalContentListItem } from "@/app/original-content/types";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function formatOriginalContentTime(value: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const values = Object.fromEntries(
    formatter
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  return `${values.month} ${values.day}, ${values.year} ${values.hour}:${values.minute}`;
}

export function OriginalContentCard({ record, timeZone }: { record: OriginalContentListItem; timeZone: string }) {
  return (
    <Card className="gap-0 border-border bg-card/80 shadow-sm">
      <Link
        href={`/original-content/${record.id}`}
        className="block rounded-xl transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <CardHeader className="gap-4 pb-0">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <Badge variant="outline" className="text-primary">
                  {record.sourceName}
                </Badge>
                {record.author ? <span>by {record.author}</span> : null}
              </div>
              <CardTitle className="text-2xl font-semibold leading-tight text-foreground">{record.title}</CardTitle>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground md:shrink-0">
              <CalendarDays className="size-4" />
              <span>{formatOriginalContentTime(record.effectiveAt, timeZone)}</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-8">
          <p className="text-base leading-8 text-muted-foreground">{record.previewText}</p>
        </CardContent>
      </Link>

      <CardFooter className="justify-start border-t-0 bg-transparent px-4 pb-4 pt-0">
        <a
          href={record.originalUrl}
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-2 px-0 text-sm font-semibold")}
        >
          <ExternalLink className="size-4" />
          Read Original
        </a>
      </CardFooter>
    </Card>
  );
}
