"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { type AddSourceResult, addSource, removeSource, toggleSourceStatus } from "@/app/actions/source-actions";
import type { SourceListItem } from "@/app/sources/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type OptimisticSourceAction =
  | { type: "remove"; id: string }
  | { type: "toggle"; id: string; status: SourceListItem["status"] };

type AddSourceFeedback = {
  message: string;
  shouldClearInput: boolean;
  shouldRefresh: boolean;
  tone: "success" | "error";
};

export function getAddSourceFeedback(result: AddSourceResult): AddSourceFeedback {
  switch (result.status) {
    case "created":
      return {
        tone: "success",
        message: result.message || "Source added.",
        shouldClearInput: true,
        shouldRefresh: true,
      };
    case "skipped_duplicate":
      return {
        tone: "success",
        message: result.message || "Source already exists.",
        shouldClearInput: true,
        shouldRefresh: true,
      };
    case "failed":
      return {
        tone: "error",
        message: result.message || "Failed to add source.",
        shouldClearInput: false,
        shouldRefresh: false,
      };
    default:
      return {
        tone: "error",
        message: "Failed to add source.",
        shouldClearInput: false,
        shouldRefresh: false,
      };
  }
}

export function SourcesClient({ initialSources }: { initialSources: SourceListItem[] }) {
  const router = useRouter();
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [isPending, startTransition] = useTransition();

  const [optimisticSources, setOptimisticSources] = useOptimistic(
    initialSources,
    (state, action: OptimisticSourceAction) => {
      switch (action.type) {
        case "remove":
          return state.filter((source) => source.id !== action.id);
        case "toggle":
          return state.map((source) =>
            source.id === action.id ? { ...source, status: getNextStatus(action.status) } : source,
          );
        default:
          return state;
      }
    },
  );

  const handleAddSource = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newSourceUrl.trim()) return;

    const url = newSourceUrl.trim();

    startTransition(async () => {
      try {
        const result = await addSource(url);
        const feedback = getAddSourceFeedback(result);

        if (feedback.shouldClearInput) {
          setNewSourceUrl("");
        }

        if (feedback.shouldRefresh) {
          router.refresh();
        }

        if (feedback.tone === "success") {
          toast.success(feedback.message);
          return;
        }

        toast.error(feedback.message);
      } catch (error) {
        console.error("Failed to add source", error);
        setNewSourceUrl(url);
        toast.error("Failed to add source.");
      }
    });
  };

  const handleToggleSource = (id: string, currentStatus: "active" | "paused" | "blocked") => {
    startTransition(async () => {
      try {
        setOptimisticSources({ type: "toggle", id, status: currentStatus });
        await toggleSourceStatus(id, currentStatus);
        router.refresh();
      } catch (error) {
        console.error("Failed to update source status", error);
        router.refresh();
        toast.error("Failed to update source status.");
      }
    });
  };

  const handleRemoveSource = (id: string) => {
    startTransition(async () => {
      try {
        setOptimisticSources({ type: "remove", id });
        const result = await removeSource(id);
        if (!result.success) {
          router.refresh();
          toast.error(result.error);
          return;
        }
        router.refresh();
      } catch (error) {
        console.error("Failed to remove source", error);
        router.refresh();
        toast.error("Failed to delete source.");
      }
    });
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-2">
      <Card className="border-border">
        <CardHeader>
          <CardTitle>Add New Source</CardTitle>
          <CardDescription>Connect a new RSS feed to your intelligence network.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddSource} className="flex flex-col sm:flex-row gap-4">
            <Input
              placeholder="RSS Feed URL"
              value={newSourceUrl}
              type="url"
              onChange={(event) => setNewSourceUrl(event.target.value)}
              className="flex-1"
              required
            />
            <Button type="submit" disabled={isPending}>
              {isPending ? "Adding..." : "Add Source"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {optimisticSources.map((source) => (
          <Card
            key={source.id}
            className={
              source.status === "active"
                ? "group transition-all border-border hover:border-primary/50"
                : "group transition-all border-border opacity-75"
            }
          >
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <Badge
                  variant={source.status === "active" ? "default" : "secondary"}
                  className={source.status === "active" ? "bg-primary text-primary-foreground" : ""}
                >
                  {source.status}
                </Badge>
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        disabled={isPending}
                      >
                        <Trash2 size={16} />
                      </Button>
                    }
                  />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确定要删除该来源吗？</AlertDialogTitle>
                      <AlertDialogDescription>此操作无法撤销。这将永久删除该数据源。</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleRemoveSource(source.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        删除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <CardTitle className="text-lg mt-2 truncate">{source.title}</CardTitle>
              <CardDescription className="truncate text-xs">{source.identifier}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Button
                type="button"
                variant="link"
                className="p-0 h-auto text-xs text-primary font-semibold hover:underline"
                onClick={() => handleToggleSource(source.id, source.status)}
                disabled={isPending}
              >
                {source.status === "active" ? "Pause Sync" : "Resume Sync"}
              </Button>
            </CardContent>
          </Card>
        ))}

        {optimisticSources.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground bg-muted/10 rounded-xl border border-dashed border-border">
            No sources configured. Try adding an RSS feed above!
          </div>
        )}
      </div>
    </div>
  );
}

function getNextStatus(status: SourceListItem["status"]) {
  return status === "active" ? "paused" : "active";
}
