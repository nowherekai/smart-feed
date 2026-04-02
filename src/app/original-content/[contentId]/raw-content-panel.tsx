import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type RawContentPanelProps = {
  raw: {
    createdAt: Date;
    format: string;
    rawBody: string;
    rawExcerpt: string | null;
  } | null;
};

function ExpandableTextBlock({ content, title }: { content: string; title: string }) {
  return (
    <details className="rounded-xl border border-border/70 bg-background/70 p-3">
      <summary className="cursor-pointer list-none font-medium text-foreground">{title}</summary>
      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 text-xs leading-6 text-foreground">
        {content}
      </pre>
    </details>
  );
}

export function RawContentPanel({ raw }: RawContentPanelProps) {
  return (
    <Card className="gap-4 border-border bg-card/80 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-lg text-foreground">Raw Content</CardTitle>
        {raw ? <Badge variant="outline">{raw.format}</Badge> : null}
      </CardHeader>

      <CardContent className="space-y-3 pb-4">
        {raw ? (
          <>
            <ExpandableTextBlock title="Raw Body" content={raw.rawBody} />
            {raw.rawExcerpt ? <ExpandableTextBlock title="Raw Excerpt" content={raw.rawExcerpt} /> : null}
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            No raw content captured for this item.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
