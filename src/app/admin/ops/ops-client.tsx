"use client";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  ExternalLink,
  LoaderCircle,
  Timer,
  Workflow,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { OpsFailureItem, OpsInsightsPageData, OpsPipelineMetric, OpsRange } from "@/app/admin/ops/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const RANGE_OPTIONS: Array<{ label: string; value: OpsRange }> = [
  { label: "日", value: "day" },
  { label: "周", value: "week" },
  { label: "月", value: "month" },
  { label: "全部", value: "all" },
];

function buildOpsUrl(range: OpsRange, pathname = "/admin/ops"): string {
  if (range === "week") {
    return pathname;
  }

  return `${pathname}?range=${range}`;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatRatio(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function formatDuration(value: number | null): string {
  if (value === null) {
    return "—";
  }

  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }

  if (value < 60_000) {
    return `${(value / 1000).toFixed(1)} s`;
  }

  return `${(value / 60_000).toFixed(1)} min`;
}

function toDate(value: Date | string): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTime(value: Date | string | null, timeZone: string): string {
  if (!value) {
    return "—";
  }

  const normalizedDate = toDate(value);

  if (!normalizedDate) {
    return "—";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(normalizedDate);
}

function MetricCard({ icon, title, value }: { icon: ReactNode; title: string; value: string }) {
  return (
    <Card className="border-border/80 bg-card/80">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="rounded-lg bg-muted p-2 text-foreground">{icon}</span>
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-tight text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

function BreakdownCard({
  icon,
  title,
  subtitle,
  totalRuns,
  completedRuns,
  failedRuns,
  runningRuns,
  successRate,
  failureRate,
  avgDurationMs,
  p95DurationMs,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
} & Pick<
  OpsPipelineMetric,
  | "avgDurationMs"
  | "completedRuns"
  | "failedRuns"
  | "failureRate"
  | "p95DurationMs"
  | "runningRuns"
  | "successRate"
  | "totalRuns"
>) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <span className="rounded-md bg-muted p-1.5 text-foreground">{icon}</span>
            <span className="truncate">{title}</span>
          </div>
          {subtitle ? <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div> : null}
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold text-foreground">{formatCount(totalRuns)}</div>
          <div className="text-xs text-muted-foreground">runs</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <StatLine label="成功" value={formatCount(completedRuns)} />
        <StatLine label="失败" value={formatCount(failedRuns)} />
        <StatLine label="运行中" value={formatCount(runningRuns)} />
        <StatLine label="成功率" value={formatRatio(successRate)} />
        <StatLine label="失败率" value={formatRatio(failureRate)} />
        <StatLine label="平均时延" value={formatDuration(avgDurationMs)} />
        <StatLine label="P95" value={formatDuration(p95DurationMs)} />
      </div>
    </div>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/30 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function FailureItemCard({ item, timeZone }: { item: OpsFailureItem; timeZone: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{item.runType === "step" ? "Step Failure" : "Pipeline Failure"}</Badge>
        <Badge variant="outline">{item.pipelineName}</Badge>
        {item.stepName ? <Badge variant="outline">{item.stepName}</Badge> : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>{formatDateTime(item.failureAt, timeZone)}</span>
        <span>时延 {formatDuration(item.durationMs)}</span>
        <span>pipeline #{item.pipelineRunId.slice(0, 8)}</span>
        {item.stepRunId ? <span>step #{item.stepRunId.slice(0, 8)}</span> : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
        <Tooltip>
          <TooltipTrigger render={<button type="button" className="w-full text-left" />}>
            <div
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
              title={item.errorMessage}
            >
              <div className="font-medium">错误信息</div>
              <div className="mt-1 line-clamp-3">{item.errorMessage}</div>
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-md border-border bg-background p-4 shadow-md">
            <p className="text-xs leading-relaxed text-muted-foreground">{item.errorMessage}</p>
          </TooltipContent>
        </Tooltip>

        <div className="space-y-2 rounded-xl bg-muted/30 p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Started</span>
            <span className="text-right text-foreground">{formatDateTime(item.startedAt, timeZone)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Finished</span>
            <span className="text-right text-foreground">{formatDateTime(item.finishedAt, timeZone)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Content</span>
            {item.contentId ? (
              <Link href={`/original-content/${item.contentId}`} className="truncate text-primary hover:underline">
                {item.contentId.slice(0, 8)}
              </Link>
            ) : (
              <span className="text-foreground">—</span>
            )}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Digest</span>
            <span className="truncate text-right text-foreground">
              {item.digestId ? item.digestId.slice(0, 8) : "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function OpsClient({ data }: { data: OpsInsightsPageData }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="p-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Activity className="size-4" />
              运维总览
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground">Ops</h1>
            <p className="text-sm text-muted-foreground">
              {data.rangeLabel} · 业务时区 {data.timeZone}
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 xl:items-end">
            <div className="inline-flex rounded-2xl border border-border bg-background p-1">
              {RANGE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  variant={option.value === data.selectedRange ? "default" : "ghost"}
                  size="sm"
                  onClick={() => router.replace(buildOpsUrl(option.value, pathname), { scroll: false })}
                >
                  {option.label}
                </Button>
              ))}
            </div>

            <a
              href={data.bullBoardUrl}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Bull Board
              <ExternalLink className="size-4" />
            </a>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="总运行数"
            value={formatCount(data.overview.totalRuns)}
            icon={<Activity className="size-4" />}
          />
          <MetricCard
            title="成功数"
            value={formatCount(data.overview.completedRuns)}
            icon={<CheckCircle2 className="size-4" />}
          />
          <MetricCard
            title="失败数"
            value={formatCount(data.overview.failedRuns)}
            icon={<AlertTriangle className="size-4" />}
          />
          <MetricCard
            title="运行中"
            value={formatCount(data.overview.runningRuns)}
            icon={<LoaderCircle className="size-4" />}
          />
          <MetricCard
            title="成功率"
            value={formatRatio(data.overview.successRate)}
            icon={<BarChart3 className="size-4" />}
          />
          <MetricCard
            title="失败率"
            value={formatRatio(data.overview.failureRate)}
            icon={<BarChart3 className="size-4" />}
          />
          <MetricCard
            title="平均时延"
            value={formatDuration(data.overview.avgDurationMs)}
            icon={<Timer className="size-4" />}
          />
          <MetricCard
            title="P95 时延"
            value={formatDuration(data.overview.p95DurationMs)}
            icon={<Clock3 className="size-4" />}
          />
        </section>

        <section>
          <Card className="border-border/80 bg-card/80">
            <CardHeader>
              <CardTitle>Pipeline Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {data.pipelineBreakdown.length === 0 ? (
                <EmptyState label="当前范围内没有 pipeline 运行数据。" />
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {data.pipelineBreakdown.map((metric) => (
                    <BreakdownCard
                      key={metric.pipelineName}
                      icon={<Workflow className="size-4" />}
                      title={metric.pipelineName}
                      totalRuns={metric.totalRuns}
                      completedRuns={metric.completedRuns}
                      failedRuns={metric.failedRuns}
                      runningRuns={metric.runningRuns}
                      successRate={metric.successRate}
                      failureRate={metric.failureRate}
                      avgDurationMs={metric.avgDurationMs}
                      p95DurationMs={metric.p95DurationMs}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="border-border/80 bg-card/80">
            <CardHeader>
              <CardTitle>Step Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {data.stepBreakdown.length === 0 ? (
                <EmptyState label="当前范围内没有 step 运行数据。" />
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {data.stepBreakdown.map((metric) => (
                    <BreakdownCard
                      key={`${metric.pipelineName}:${metric.stepName}`}
                      icon={<Wrench className="size-4" />}
                      title={metric.stepName}
                      subtitle={metric.pipelineName}
                      totalRuns={metric.totalRuns}
                      completedRuns={metric.completedRuns}
                      failedRuns={metric.failedRuns}
                      runningRuns={metric.runningRuns}
                      successRate={metric.successRate}
                      failureRate={metric.failureRate}
                      avgDurationMs={metric.avgDurationMs}
                      p95DurationMs={metric.p95DurationMs}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="border-border/80 bg-card/80">
            <CardHeader>
              <CardTitle>Recent Failures</CardTitle>
            </CardHeader>
            <CardContent>
              {data.recentFailures.length === 0 ? (
                <EmptyState label="当前范围内没有失败记录。" />
              ) : (
                <div className="space-y-4">
                  {data.recentFailures.map((item) => (
                    <FailureItemCard
                      key={`${item.runType}:${item.stepRunId ?? item.pipelineRunId}`}
                      item={item}
                      timeZone={data.timeZone}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
