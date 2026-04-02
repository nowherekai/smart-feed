import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type CleanedMarkdownPanelProps = {
  cleanedMd: string | null;
  timeZone: string;
  updatedAt: Date;
};

function formatDateTime(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(value);
}

function getByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function CleanedMarkdownPanel({ cleanedMd, timeZone, updatedAt }: CleanedMarkdownPanelProps) {
  const normalizedMarkdown = cleanedMd?.trim() ? cleanedMd : null;

  return (
    <Card className="gap-4 border-border bg-card/80 shadow-sm">
      <CardHeader className="space-y-2">
        <CardTitle className="text-lg text-foreground">Cleaned Markdown</CardTitle>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>{normalizedMarkdown ? `${getByteLength(normalizedMarkdown)} bytes` : "0 bytes"}</span>
          <span>Updated {formatDateTime(updatedAt, timeZone)}</span>
        </div>
      </CardHeader>

      <CardContent className="pb-4">
        {normalizedMarkdown ? (
          <details className="rounded-xl border border-border/70 bg-background/70 p-3">
            <summary className="cursor-pointer list-none font-medium text-foreground">Markdown Source</summary>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 text-xs leading-6 text-foreground">
              {normalizedMarkdown}
            </pre>
          </details>
        ) : (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            Not yet normalized.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
