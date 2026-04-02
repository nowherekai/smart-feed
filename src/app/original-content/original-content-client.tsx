"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { type RefObject, useEffect, useRef, useState } from "react";
import type {
  OriginalContentFilterRange,
  OriginalContentPageData,
  OriginalContentSourceOption,
} from "@/app/original-content/types";
import { OriginalContentCard } from "@/components/features/original-content-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type OriginalContentUrlState = {
  page: number;
  range: OriginalContentFilterRange;
  sourceId: string | null;
};

const RANGE_OPTIONS: Array<{ label: string; value: OriginalContentFilterRange }> = [
  { label: "All Time", value: "all" },
  { label: "Today", value: "today" },
  { label: "Last 2 Days", value: "last-2-days" },
  { label: "Last Week", value: "last-week" },
];

export function filterOriginalContentSourceOptions(
  options: OriginalContentSourceOption[],
  query: string,
): OriginalContentSourceOption[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return options;
  }

  return options.filter((option) => {
    const title = option.title.toLowerCase();
    const identifier = option.identifier.toLowerCase();

    return title.includes(normalizedQuery) || identifier.includes(normalizedQuery);
  });
}

export function buildOriginalContentUrl(state: OriginalContentUrlState, pathname = "/original-content"): string {
  const params = new URLSearchParams();

  if (state.range !== "all") {
    params.set("range", state.range);
  }

  if (state.sourceId) {
    params.set("sourceId", state.sourceId);
  }

  if (state.page > 1) {
    params.set("page", String(state.page));
  }

  const queryString = params.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

function useOutsideClose(refs: Array<RefObject<HTMLElement | null>>, onClose: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      const clickedInside = refs.some((ref) => ref.current?.contains(target));

      if (!clickedInside) {
        onClose();
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [enabled, onClose, refs]);
}

function FilterPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "absolute right-0 top-[calc(100%+0.5rem)] z-20 min-w-56 rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-xl ring-1 ring-black/5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function OriginalContentClient({
  data,
  sources,
}: {
  data: OriginalContentPageData;
  sources: OriginalContentSourceOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<"range" | "source" | null>(null);
  const [sourceQuery, setSourceQuery] = useState("");
  const rangeRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<HTMLDivElement | null>(null);

  useOutsideClose([rangeRef, sourceRef], () => setOpenMenu(null), openMenu !== null);

  const selectedSource = sources.find((option) => option.id === data.selectedSourceId) ?? null;
  const visibleSources = filterOriginalContentSourceOptions(sources, sourceQuery);
  const currentUrlState: OriginalContentUrlState = {
    page: data.page,
    range: data.selectedRange,
    sourceId: data.selectedSourceId,
  };

  function navigate(nextState: OriginalContentUrlState) {
    router.replace(buildOriginalContentUrl(nextState, pathname), { scroll: false });
  }

  function updateRange(range: OriginalContentFilterRange) {
    navigate({
      ...currentUrlState,
      range,
      page: 1,
    });
    setOpenMenu(null);
  }

  function updateSource(sourceId: string | null) {
    navigate({
      ...currentUrlState,
      sourceId,
      page: 1,
    });
    setSourceQuery("");
    setOpenMenu(null);
  }

  function updatePage(page: number) {
    navigate({
      ...currentUrlState,
      page,
    });
  }

  return (
    <div className="p-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-4xl font-bold tracking-tight text-foreground">Original Feeds</h3>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div ref={rangeRef} className="relative">
              <Button variant="outline" size="lg" onClick={() => setOpenMenu(openMenu === "range" ? null : "range")}>
                <span>{RANGE_OPTIONS.find((option) => option.value === data.selectedRange)?.label ?? "All Time"}</span>
                <ChevronDown className="size-4" />
              </Button>

              {openMenu === "range" ? (
                <FilterPanel className="min-w-52 p-2">
                  <div className="space-y-1">
                    {RANGE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => updateRange(option.value)}
                        className={cn(
                          "flex w-full items-center rounded-xl px-3 py-2 text-left text-base transition-colors",
                          option.value === data.selectedRange
                            ? "bg-muted font-medium text-foreground"
                            : "hover:bg-muted/70",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </FilterPanel>
              ) : null}
            </div>

            <div ref={sourceRef} className="relative">
              <Button
                variant="outline"
                size="lg"
                onClick={() => {
                  setOpenMenu(openMenu === "source" ? null : "source");
                  setSourceQuery("");
                }}
              >
                <span className="max-w-48 truncate">{selectedSource?.title ?? "All Sources"}</span>
                <ChevronDown className="size-4" />
              </Button>

              {openMenu === "source" ? (
                <FilterPanel className="w-[22rem] p-3">
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={sourceQuery}
                        onChange={(event) => setSourceQuery(event.currentTarget.value)}
                        placeholder="Search sources"
                        className="pl-9"
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{visibleSources.length} sources</span>
                      {data.selectedSourceId ? (
                        <button
                          type="button"
                          onClick={() => updateSource(null)}
                          className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
                        >
                          <X className="size-3" />
                          Clear
                        </button>
                      ) : null}
                    </div>

                    <ScrollArea className="max-h-72">
                      <div className="space-y-1 pr-3">
                        <button
                          type="button"
                          onClick={() => updateSource(null)}
                          className={cn(
                            "flex w-full flex-col rounded-xl px-3 py-2 text-left transition-colors",
                            data.selectedSourceId === null ? "bg-muted" : "hover:bg-muted/70",
                          )}
                        >
                          <span className="font-medium text-foreground">All Sources</span>
                          <span className="text-xs text-muted-foreground">Show content from every source</span>
                        </button>

                        {visibleSources.length > 0 ? (
                          visibleSources.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => updateSource(option.id)}
                              className={cn(
                                "flex w-full flex-col rounded-xl px-3 py-2 text-left transition-colors",
                                option.id === data.selectedSourceId ? "bg-muted" : "hover:bg-muted/70",
                              )}
                            >
                              <span className="font-medium text-foreground">{option.title}</span>
                              <span className="truncate text-xs text-muted-foreground">{option.identifier}</span>
                            </button>
                          ))
                        ) : (
                          <div className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                            No sources found.
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </FilterPanel>
              ) : null}
            </div>
          </div>
        </div>

        {data.items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/60 px-6 py-16 text-center text-muted-foreground">
            No original content found for the current filters.
          </div>
        ) : (
          <div className="space-y-8">
            <div className="space-y-6">
              {data.items.map((item) => (
                <OriginalContentCard key={item.id} record={item} timeZone={data.timeZone} />
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
