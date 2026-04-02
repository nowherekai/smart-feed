"use client";

import { BrainCircuit, LoaderCircle, RefreshCw, Sparkles, Workflow } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ContentDebugActionInput } from "@/app/actions/content-debug-action-impl";
import { enqueueBasicAnalysis, enqueueFullAiFlow, enqueueHeavyAnalysis } from "@/app/actions/content-debug-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ActionKey = "basic" | "heavy" | "full";

type ContentDetailActionsProps = {
  canRunBasic: boolean;
  canRunFull: boolean;
  canRunHeavy: boolean;
  contentId: string;
};

type ActionDescriptor = {
  action: (input: ContentDebugActionInput) => Promise<{ message: string; success: boolean }>;
  description: string;
  disabledReason: string | null;
  icon: typeof Sparkles;
  key: ActionKey;
  label: string;
};

export function ContentDetailRefreshButton() {
  const router = useRouter();
  const [isRefreshing, startRefreshTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isRefreshing}
      onClick={() => {
        startRefreshTransition(() => {
          router.refresh();
        });
      }}
    >
      {isRefreshing ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
      Refresh
    </Button>
  );
}

export function ContentDetailActions({ canRunBasic, canRunFull, canRunHeavy, contentId }: ContentDetailActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<ActionKey | null>(null);
  const [recordMode, setRecordMode] = useState<ContentDebugActionInput["recordMode"]>("new-record");
  const [variantTag, setVariantTag] = useState("");

  const actions: ActionDescriptor[] = [
    {
      key: "basic",
      label: "Run Basic Analysis",
      description: "Queue `content.analyze.basic` with the normalized content.",
      disabledReason: canRunBasic ? null : "Requires normalized content",
      icon: Sparkles,
      action: enqueueBasicAnalysis,
    },
    {
      key: "heavy",
      label: "Run Heavy Analysis",
      description: "Queue `content.analyze.heavy` from the latest content state.",
      disabledReason: canRunHeavy ? null : "Requires basic analysis first",
      icon: BrainCircuit,
      action: enqueueHeavyAnalysis,
    },
    {
      key: "full",
      label: "Run Full AI Flow",
      description: "Re-enter from basic analysis; heavy continues only after the score threshold.",
      disabledReason: canRunFull ? null : "Requires normalized content",
      icon: Workflow,
      action: enqueueFullAiFlow,
    },
  ];

  function runAction(descriptor: ActionDescriptor) {
    setPendingAction(descriptor.key);

    startTransition(async () => {
      try {
        const result = await descriptor.action({
          contentId,
          recordMode,
          variantTag,
        });

        if (result.success) {
          toast.success(result.message);
          return;
        }

        toast.error(result.message);
      } catch (error) {
        console.error(`Failed to run content debug action: ${descriptor.key}`, error);
        toast.error("Failed to submit debug action.");
      } finally {
        setPendingAction(null);
      }
    });
  }

  return (
    <Card className="gap-4 border-border bg-card/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-foreground">Actions</CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 pb-4">
        <div className="rounded-xl border border-border/70 bg-background/70 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Run Mode</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant={recordMode === "new-record" ? "default" : "outline"}
              size="sm"
              disabled={isPending}
              onClick={() => setRecordMode("new-record")}
            >
              New Record
            </Button>
            <Button
              type="button"
              variant={recordMode === "overwrite" ? "default" : "outline"}
              size="sm"
              disabled={isPending}
              onClick={() => setRecordMode("overwrite")}
            >
              Overwrite Existing
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            <Input
              value={variantTag}
              onChange={(event) => setVariantTag(event.currentTarget.value)}
              placeholder="Variant tag, e.g. api-b"
              disabled={isPending}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              Variant tag is optional. Use it to separate different API or experiment runs.
            </p>
          </div>
        </div>

        {actions.map((descriptor) => {
          const Icon = descriptor.icon;
          const isCurrentPending = isPending && pendingAction === descriptor.key;
          const isDisabled = isPending || Boolean(descriptor.disabledReason);

          return (
            <div
              key={descriptor.key}
              className={cn("rounded-xl border border-border/70 bg-background/70 p-3", isDisabled && "opacity-80")}
            >
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start gap-2"
                disabled={isDisabled}
                title={descriptor.disabledReason ?? undefined}
                onClick={() => runAction(descriptor)}
              >
                {isCurrentPending ? <LoaderCircle className="size-4 animate-spin" /> : <Icon className="size-4" />}
                {descriptor.label}
              </Button>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{descriptor.description}</p>
              {descriptor.disabledReason ? (
                <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                  {descriptor.disabledReason}
                </p>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
