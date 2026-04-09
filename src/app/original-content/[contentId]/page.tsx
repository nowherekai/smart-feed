import { AlertCircle, ArrowLeft, ExternalLink, Link2, Rss, Workflow } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getContentDetail } from "@/app/actions/original-content-actions";
import { CleanedMarkdownPanel } from "@/app/original-content/[contentId]/cleaned-markdown-panel";
import {
  ContentDetailActions,
  ContentDetailRefreshButton,
} from "@/app/original-content/[contentId]/content-detail-actions";
import { RawContentPanel } from "@/app/original-content/[contentId]/raw-content-panel";
import type {
  ContentDetailAnalysisRecord,
  ContentDetailData,
  ContentDetailPipelineRun,
} from "@/app/original-content/[contentId]/types";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ContentDetailPageProps = {
  params: Promise<{
    contentId: string;
  }>;
};

function formatDateTime(value: Date | null, timeZone: string): string {
  if (!value) {
    return "—";
  }

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

function getDisplayTitle(data: ContentDetailData["base"]): string {
  return data.title?.trim() ? data.title.trim() : data.originalUrl;
}

function getSourceName(data: ContentDetailData["base"]["source"]): string {
  return data.title?.trim() ? data.title.trim() : data.identifier;
}

const statusBadgeClassMap: Record<string, string> = {
  sentinel: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
  raw: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
  normalized: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  analyzed:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  digested:
    "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-900 dark:bg-fuchsia-950 dark:text-fuchsia-300",
  failed: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
  basic: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
  full: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  completed:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  "failed-run": "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
  running: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300",
  pending: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300",
};

function getStatusBadgeClass(status: string): string {
  return statusBadgeClassMap[status] ?? "border-border bg-background text-foreground";
}

function getRunStatusSymbol(status: string): string {
  switch (status) {
    case "pending":
      return "⏳";
    case "running":
      return "🔄";
    case "completed":
      return "✓";
    case "failed":
      return "✗";
    default:
      return "•";
  }
}

function MetadataItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="space-y-1 rounded-xl border border-border/70 bg-background/70 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="break-words text-sm text-foreground">{value}</div>
    </div>
  );
}

function SectionCard({ children, title }: { children: ReactNode; title: string }) {
  return (
    <Card className="gap-4 border-border bg-card/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pb-4">{children}</CardContent>
    </Card>
  );
}

function AnalysisRecordCard({ record, timeZone }: { record: ContentDetailAnalysisRecord; timeZone: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/70 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn(getStatusBadgeClass(record.status))}>
              {record.status}
            </Badge>
            <span className="text-sm font-medium text-foreground">
              {record.summary?.summary ?? record.promptVersion}
            </span>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>Model {record.modelStrategy}</span>
            <span>Prompt {record.promptVersion}</span>
            <span>Score {record.valueScore}</span>
            <span>{formatDateTime(record.createdAt, timeZone)}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          {record.categories.map((category) => (
            <Badge key={`category-${record.id}-${category}`} variant="outline">
              {category}
            </Badge>
          ))}
          {record.keywords.map((keyword) => (
            <Badge key={`keyword-${record.id}-${keyword}`} variant="outline" className="text-muted-foreground">
              {keyword}
            </Badge>
          ))}
          {record.entities.map((entity) => (
            <Badge key={`entity-${record.id}-${entity}`} variant="outline" className="text-primary">
              {entity}
            </Badge>
          ))}
        </div>

        {record.summary?.paragraphSummaries.length ? (
          <ul className="space-y-2 text-sm text-foreground">
            {record.summary.paragraphSummaries.map((point) => (
              <li key={`${record.id}-point-${point}`}>{point}</li>
            ))}
          </ul>
        ) : null}

        {record.summary?.summary ? (
          <p className="text-sm leading-6 text-muted-foreground">{record.summary.summary}</p>
        ) : null}
      </div>
    </div>
  );
}

function PipelineRunCard({ run, timeZone }: { run: ContentDetailPipelineRun; timeZone: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/70 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn(getStatusBadgeClass(run.status))}>
              {run.status}
            </Badge>
            <span className="text-sm font-medium text-foreground">
              {run.pipelineName} {run.pipelineVersion}
            </span>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>Started {formatDateTime(run.startedAt, timeZone)}</span>
            <span>Finished {formatDateTime(run.finishedAt, timeZone)}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {run.steps.map((step) => (
          <div key={step.id} className="rounded-xl border border-border/60 bg-card/70 p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
              <span>{getRunStatusSymbol(step.status)}</span>
              <span className="font-medium">{step.stepName}</span>
              <Badge
                variant="outline"
                className={cn(getStatusBadgeClass(step.status === "failed" ? "failed-run" : step.status))}
              >
                {step.status}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span>Started {formatDateTime(step.startedAt, timeZone)}</span>
              <span>Finished {formatDateTime(step.finishedAt, timeZone)}</span>
            </div>
            {step.errorMessage ? (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-red-700 dark:bg-red-950 dark:text-red-300">
                {step.errorMessage}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function ContentDetailPage({ params }: ContentDetailPageProps) {
  const { contentId } = await params;
  const detail = await getContentDetail(contentId);

  if (!detail) {
    notFound();
  }

  const hasNormalizedContent = Boolean(detail.base.cleanedMd?.trim());
  const hasBasicAnalysis = detail.analysisRecords.some((record) => record.status === "basic");

  return (
    <ScrollArea className="flex-1 h-full w-full">
      <div className="p-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Link
              href="/original-content"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit gap-2")}
            >
              <ArrowLeft className="size-4" />
              Back to Original Feeds
            </Link>
            <ContentDetailRefreshButton />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <SectionCard title="Content Meta">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={cn(getStatusBadgeClass(detail.base.status))}>
                    {detail.base.status}
                  </Badge>
                  <Badge variant="outline">{detail.base.kind}</Badge>
                  <Badge variant="outline" className="text-primary">
                    {getSourceName(detail.base.source)}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                    {getDisplayTitle(detail.base)}
                  </h1>
                  {detail.base.author ? <p className="text-sm text-muted-foreground">by {detail.base.author}</p> : null}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <MetadataItem
                    label="Original URL"
                    value={
                      <a
                        href={detail.base.originalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <span className="truncate">{detail.base.originalUrl}</span>
                        <ExternalLink className="size-3.5" />
                      </a>
                    }
                  />
                  <MetadataItem label="Source Identifier" value={detail.base.source.identifier} />
                  <MetadataItem label="Published" value={formatDateTime(detail.base.publishedAt, detail.timeZone)} />
                  <MetadataItem label="Fetched" value={formatDateTime(detail.base.fetchedAt, detail.timeZone)} />
                  <MetadataItem label="Effective" value={formatDateTime(detail.base.effectiveAt, detail.timeZone)} />
                  <MetadataItem label="Updated" value={formatDateTime(detail.base.updatedAt, detail.timeZone)} />
                  <MetadataItem
                    label="Cleaned Markdown"
                    value={hasNormalizedContent ? `${getByteLength(detail.base.cleanedMd ?? "")} bytes` : "Empty"}
                  />
                  <MetadataItem label="External Id" value={detail.base.externalId ?? "—"} />
                </div>

                {detail.base.processingError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                    <div className="flex items-center gap-2 font-medium">
                      <AlertCircle className="size-4" />
                      Processing Error
                    </div>
                    <p className="mt-2 leading-6">{detail.base.processingError}</p>
                  </div>
                ) : null}
              </div>
            </SectionCard>

            <div className="space-y-6">
              <ContentDetailActions
                contentId={detail.base.id}
                canRunBasic={hasNormalizedContent}
                canRunHeavy={hasBasicAnalysis}
                canRunFull={hasNormalizedContent}
              />

              <Card className="gap-4 border-border bg-card/80 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg text-foreground">Traceability</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pb-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Rss className="size-4" />
                    <span>{detail.base.source.type}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link2 className="size-4" />
                    <span>{detail.base.id}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Workflow className="size-4" />
                    <span>{detail.pipelineRuns.length} pipeline runs</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <RawContentPanel raw={detail.base.raw} />

          <CleanedMarkdownPanel
            cleanedMd={detail.base.cleanedMd}
            updatedAt={detail.base.updatedAt}
            timeZone={detail.timeZone}
          />

          <SectionCard title={`Analysis Records (${detail.analysisRecords.length})`}>
            {detail.analysisRecords.length > 0 ? (
              <div className="space-y-4">
                {detail.analysisRecords.map((record) => (
                  <AnalysisRecordCard key={record.id} record={record} timeZone={detail.timeZone} />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                No analysis records.
              </div>
            )}
          </SectionCard>

          <SectionCard title={`Pipeline Runs (${detail.pipelineRuns.length})`}>
            {detail.pipelineRuns.length > 0 ? (
              <div className="space-y-4">
                {detail.pipelineRuns.map((run) => (
                  <PipelineRunCard key={run.id} run={run} timeZone={detail.timeZone} />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                No pipeline runs.
              </div>
            )}
          </SectionCard>

          <SectionCard title={`Digest Relations (${detail.digestRelations.length})`}>
            {detail.digestRelations.length > 0 ? (
              <div className="space-y-3">
                {detail.digestRelations.map((relation) => (
                  <div key={relation.digestItemId} className="rounded-xl border border-border/70 bg-background/70 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{relation.period}</Badge>
                      <Badge variant="outline" className={cn(getStatusBadgeClass(relation.digestStatus))}>
                        {relation.digestStatus}
                      </Badge>
                      {relation.period === "daily" && ["ready", "sent"].includes(relation.digestStatus) ? (
                        <Link
                          href={`/digests/${relation.digestDate}`}
                          className="text-sm font-medium text-primary hover:underline hover:text-primary/80 transition-colors"
                        >
                          {relation.digestDate}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium text-foreground">{relation.digestDate}</span>
                      )}
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <MetadataItem label="Section" value={relation.sectionTitle} />
                      <MetadataItem label="Rank" value={String(relation.rank)} />
                      <MetadataItem label="Analysis Record" value={relation.analysisRecordId} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                Not included in any digest.
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </ScrollArea>
  );
}
