"use client";

import { ChevronLeft, ChevronRight, ExternalLink, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { AnalysisListItem, AnalysisPageData } from "@/app/analysis/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function buildAnalysisUrl(page: number, pathname = "/analysis"): string {
  if (page <= 1) {
    return pathname;
  }

  return `${pathname}?page=${page}`;
}

function AnalysisCard({ item }: { item: AnalysisListItem }) {
  return (
    <Card className="overflow-hidden border-border hover:shadow-lg transition-shadow group">
      <div className="h-1.5 bg-primary" style={{ opacity: item.valueScore / 10 }} />
      <CardHeader className="pb-3">
        <div className="flex flex-wrap justify-between items-start mb-2 gap-2">
          <div className="flex flex-wrap gap-2">
            {item.categories.map((cat) => (
              <Badge key={cat} variant="secondary" className="text-[10px] uppercase tracking-wider font-bold">
                {cat}
              </Badge>
            ))}
            {item.status === "full" && (
              <Badge variant="default" className="text-[10px] uppercase tracking-wider font-bold">
                Full
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 text-primary font-bold text-sm shrink-0">
            <Zap size={14} />
            {item.valueScore}
          </div>
        </div>
        <CardTitle className="line-clamp-2 text-lg leading-snug transition-colors group-hover:text-primary">
          {item.summary.summary}
        </CardTitle>
        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
          via <span className="font-medium text-foreground">{item.sourceName}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {item.summary.paragraphSummaries.length > 0 && (
          <ul className="space-y-1.5">
            {item.summary.paragraphSummaries.slice(0, 3).map((point, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Static read-only list
              <li key={i} className="text-muted-foreground text-sm flex gap-2">
                <span className="text-primary font-bold shrink-0">•</span>
                <span className="line-clamp-2">{point}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-4 pt-1">
          {item.originalUrl && (
            <Link
              href={item.originalUrl}
              className={buttonVariants({
                variant: "outline",
                size: "sm",
                className: "h-8 text-xs bg-background",
              })}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={14} className="mr-2" /> View Original
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function AnalysisClient({ data }: { data: AnalysisPageData }) {
  const router = useRouter();
  const pathname = usePathname();
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const viewport = contentRef.current?.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (viewport && data.page >= 1) {
      viewport.scrollTop = 0;
    }
  }, [data.page]);

  function updatePage(page: number) {
    router.replace(buildAnalysisUrl(page, pathname), { scroll: false });
  }

  return (
    <div ref={contentRef} className="p-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <div className="space-y-1">
          <h3 className="text-4xl font-bold tracking-tight text-foreground">Analysis</h3>
        </div>

        {data.items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/60 px-6 py-16 text-center text-muted-foreground">
            No analysis records yet.
          </div>
        ) : (
          <div className="space-y-8">
            <div className="space-y-6">
              {data.items.map((item) => (
                <AnalysisCard key={item.id} item={item} />
              ))}
            </div>

            <div className="flex justify-center">
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-background px-3 py-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => updatePage(data.page - 1)}
                  disabled={data.page <= 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="min-w-14 text-center text-sm font-medium text-foreground">
                  {data.page} / {data.totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => updatePage(data.page + 1)}
                  disabled={data.page >= data.totalPages}
                  aria-label="Next page"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
