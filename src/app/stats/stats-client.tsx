"use client";

import { BarChart3, Database, FolderKanban, Sparkles, TrendingUp } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { StatsPageData, StatsRange, StatsTrendPoint } from "@/app/stats/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const RANGE_OPTIONS: Array<{ label: string; value: StatsRange }> = [
  { label: "日", value: "day" },
  { label: "周", value: "week" },
  { label: "月", value: "month" },
  { label: "全部", value: "all" },
];

function buildStatsUrl(range: StatsRange, pathname = "/stats"): string {
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
    return "0%";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function MetricCard({
  description,
  icon,
  isGlobal = false,
  title,
  value,
}: {
  description: string;
  icon: ReactNode;
  isGlobal?: boolean;
  title: string;
  value: string;
}) {
  return (
    <Card className="border-border/80 bg-card/80">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="rounded-lg bg-muted p-2 text-foreground">{icon}</span>
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
          </div>
          {isGlobal ? <Badge variant="outline">全局</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-3xl font-semibold tracking-tight text-foreground">{value}</div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function TrendChart({ points }: { points: StatsTrendPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center text-sm text-muted-foreground">
        当前范围内还没有可展示的趋势数据。
      </div>
    );
  }

  const maxCount = Math.max(...points.flatMap((point) => [point.contentCount, point.analyzedCount]), 1);
  const labelStride = points.length > 16 ? Math.ceil(points.length / 8) : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          新增文章
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          完成分析
        </span>
      </div>

      <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
        <div className="flex h-56 items-end gap-2 overflow-x-auto">
          {points.map((point, index) => {
            const contentHeight = `${Math.max((point.contentCount / maxCount) * 100, point.contentCount > 0 ? 8 : 0)}%`;
            const analyzedHeight = `${Math.max((point.analyzedCount / maxCount) * 100, point.analyzedCount > 0 ? 8 : 0)}%`;

            return (
              <div key={point.bucketKey} className="flex min-w-10 flex-1 flex-col items-center gap-2">
                <div className="flex h-44 w-full items-end justify-center gap-1">
                  <div
                    className="w-3 rounded-t-md bg-primary/90"
                    style={{ height: contentHeight }}
                    title={`${point.bucketLabel} 新增 ${point.contentCount}`}
                  />
                  <div
                    className="w-3 rounded-t-md bg-emerald-500/90"
                    style={{ height: analyzedHeight }}
                    title={`${point.bucketLabel} 分析 ${point.analyzedCount}`}
                  />
                </div>
                <div className="h-8 text-center text-[11px] leading-tight text-muted-foreground">
                  {index % labelStride === 0 ? point.bucketLabel : ""}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function StatsClient({ data }: { data: StatsPageData }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="p-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <BarChart3 className="size-4" />
              内容统计
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground">Stats</h1>
            <p className="text-sm text-muted-foreground">
              {data.rangeLabel} · 业务时区 {data.timeZone}
            </p>
          </div>

          <div className="inline-flex rounded-2xl border border-border bg-background p-1">
            {RANGE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                variant={option.value === data.selectedRange ? "default" : "ghost"}
                size="sm"
                onClick={() => router.replace(buildStatsUrl(option.value, pathname), { scroll: false })}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            title="文章总数"
            value={formatCount(data.overview.totalContents)}
            description="按当前时间范围统计内容规模。"
            icon={<Database className="size-4" />}
          />
          <MetricCard
            title="已分析"
            value={formatCount(data.overview.analyzedContents)}
            description="状态为 analyzed 或 digested 的文章。"
            icon={<TrendingUp className="size-4" />}
          />
          <MetricCard
            title="已入 Digest"
            value={formatCount(data.overview.digestedContents)}
            description="状态为 digested 的文章。"
            icon={<FolderKanban className="size-4" />}
          />
          <MetricCard
            title="高价值文章"
            value={`${formatCount(data.overview.highValueContents)} · ${formatRatio(data.overview.highValueRatio)}`}
            description="按去重分析记录统计 valueScore >= 7。"
            icon={<Sparkles className="size-4" />}
          />
          <MetricCard
            title="Active Sources"
            value={formatCount(data.overview.activeSources)}
            description="当前处于 active 状态的来源数。"
            icon={<TrendingUp className="size-4" />}
            isGlobal
          />
          <MetricCard
            title="总 Sources"
            value={formatCount(data.overview.totalSources)}
            description="来源总量，不随时间切换变化。"
            icon={<Database className="size-4" />}
            isGlobal
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-border/80 bg-card/80">
            <CardHeader className="space-y-2">
              <CardTitle>内容漏斗</CardTitle>
              <p className="text-sm text-muted-foreground">基于 content_items.status 统计处理阶段。</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.funnel.map((step) => (
                <div key={step.key} className="space-y-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-foreground">{step.label}</span>
                    <span className="text-muted-foreground">
                      {formatCount(step.count)}
                      {step.ratio !== null ? ` · ${formatRatio(step.ratio)}` : ""}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary transition-[width]"
                      style={{ width: `${Math.max((step.ratio ?? 1) * 100, step.count > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/80">
            <CardHeader className="space-y-2">
              <CardTitle>来源产出 Top 5</CardTitle>
              <p className="text-sm text-muted-foreground">按当前范围内文章产出排序。</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.topSources.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-5 py-10 text-center text-sm text-muted-foreground">
                  当前范围内还没有来源产出数据。
                </div>
              ) : (
                data.topSources.map((source, index) => (
                  <div
                    key={source.sourceId}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-background/80 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">#{index + 1}</div>
                      <div className="truncate font-medium text-foreground">{source.sourceName}</div>
                    </div>
                    <div className="shrink-0 text-sm font-semibold text-foreground">
                      {formatCount(source.itemCount)}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="border-border/80 bg-card/80">
            <CardHeader className="space-y-2">
              <CardTitle>趋势</CardTitle>
              <p className="text-sm text-muted-foreground">新增文章与完成分析按当前范围分桶展示。</p>
            </CardHeader>
            <CardContent>
              <TrendChart points={data.trends} />
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
