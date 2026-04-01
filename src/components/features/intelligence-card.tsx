"use client";

import { CheckCircle2, ChevronRight, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AnalysisRecord } from "@/db/schema";

interface IntelligenceCardProps {
  record: AnalysisRecord;
}

export function IntelligenceCard({ record }: IntelligenceCardProps) {
  const summary = record.summary;

  if (!summary) return null; // Safe guard

  return (
    <Card className="overflow-hidden border-border hover:shadow-lg transition-shadow group">
      {/* Visual Indicator of Value Score */}
      <div className="h-1.5 bg-primary" style={{ opacity: record.valueScore / 10 }} />
      <CardHeader className="pb-3">
        <div className="flex flex-wrap justify-between items-start mb-2 gap-2">
          <div className="flex flex-wrap gap-2">
            {record.categories?.map((cat) => (
              <Badge key={cat} variant="secondary" className="text-[10px] uppercase tracking-wider font-bold">
                {cat}
              </Badge>
            ))}
          </div>
          <div className="flex items-center gap-1 text-primary font-bold text-sm shrink-0">
            <Zap size={14} />
            {record.valueScore}
          </div>
        </div>
        <CardTitle className="text-xl leading-snug group-hover:text-primary transition-colors">
          {summary.oneline}
        </CardTitle>
        <CardDescription className="flex items-center gap-1 mt-2 text-xs">
          via <span className="font-medium text-foreground">{record.sourceName}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground line-clamp-2">{summary.points?.[0]}</p>
        <div className="flex items-center justify-between pt-2">
          {record.evidenceSnippet && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <div className="flex items-center gap-1 text-xs text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                }
              >
                <CheckCircle2 size={12} />
                Traceable Evidence
              </TooltipTrigger>
              <TooltipContent className="max-w-[300px] p-4 bg-background border-border text-foreground shadow-md">
                <p className="text-xs italic leading-relaxed text-muted-foreground">"{record.evidenceSnippet}"</p>
              </TooltipContent>
            </Tooltip>
          )}
          <Button variant="ghost" size="sm" className="h-8 text-xs shrink-0 ml-auto">
            Read More <ChevronRight size={14} className="ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
