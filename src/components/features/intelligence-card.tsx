import { Zap } from "lucide-react";
import { EvidenceTooltip } from "@/components/features/evidence-tooltip";
import type { IntelligenceCardRecord } from "@/components/features/intelligence-view-model";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface IntelligenceCardProps {
  record: IntelligenceCardRecord;
}

export function IntelligenceCard({ record }: IntelligenceCardProps) {
  return (
    <Card className="overflow-hidden border-border hover:shadow-lg transition-shadow group">
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
          {record.summary.oneline}
        </CardTitle>
        <CardDescription className="flex items-center gap-1 mt-2 text-xs">
          via <span className="font-medium text-foreground">{record.sourceName}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground line-clamp-2">{record.summary.points[0]}</p>
        <div className="flex items-center justify-between pt-2">
          {record.evidenceSnippet && (
            <EvidenceTooltip label="Traceable Evidence" content={record.evidenceSnippet} variant="badge" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
