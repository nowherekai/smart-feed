"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AnalysisRecord } from "@/db/schema";

interface DigestItemProps {
  record: AnalysisRecord;
}

export function DigestItem({ record }: DigestItemProps) {
  const summary = record.summary;
  if (!summary) return null;

  return (
    <div className="group relative pl-8 border-l-2 border-border/50 hover:border-primary/50 transition-colors py-2">
      <div className="absolute left-[-9px] top-4 w-4 h-4 rounded-full bg-background border-2 border-border group-hover:border-primary/50 transition-colors" />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h5 className="text-xl font-bold tracking-tight text-foreground">{summary.oneline}</h5>
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            {record.sourceName}
          </Badge>
        </div>

        <ul className="space-y-2">
          {summary.points.map((point, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: The points array is a read-only static list
            <li key={i} className="text-muted-foreground text-sm flex gap-2">
              <span className="text-primary font-bold shrink-0">•</span>
              <span>{point}</span>
            </li>
          ))}
        </ul>

        <div className="bg-muted/30 p-4 rounded-lg border border-border/50">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Why it matters</p>
          <p className="text-sm text-foreground leading-relaxed">{summary.reason}</p>
        </div>

        <div className="flex items-center gap-4 pt-2">
          {record.originalUrl && (
            <Link
              href={record.originalUrl}
              className={buttonVariants({ variant: "outline", size: "sm", className: "h-8 text-xs bg-background" })}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={14} className="mr-2" /> View Original
            </Link>
          )}
          {record.evidenceSnippet && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
                  />
                }
              >
                Show Evidence
              </TooltipTrigger>
              <TooltipContent className="max-w-md p-4 bg-background border-border shadow-md">
                <p className="text-xs leading-relaxed italic text-muted-foreground">"{record.evidenceSnippet}"</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}
