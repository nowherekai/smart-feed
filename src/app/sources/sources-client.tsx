"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { addSource, removeSource, toggleSourceStatus } from "@/app/actions/source-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Source } from "@/db/schema";

export function SourcesClient({ initialSources }: { initialSources: Source[] }) {
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceTitle, setNewSourceTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  const [optimisticSources, setOptimisticSources] = useOptimistic(
    initialSources,
    (state, action: { type: "add" | "remove" | "toggle"; source?: Source; id?: string; status?: string }) => {
      switch (action.type) {
        case "add":
          return [action.source!, ...state];
        case "remove":
          return state.filter((s) => s.id !== action.id);
        case "toggle":
          return state.map((s) =>
            s.id === action.id ? { ...s, status: action.status === "active" ? "paused" : "active" } : s,
          );
        default:
          return state;
      }
    },
  );

  const handleAddSource = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSourceUrl.trim() || !newSourceTitle.trim()) return;

    startTransition(async () => {
      // Optimistic update
      const fakeId = crypto.randomUUID();
      const newSource: Source = {
        id: fakeId,
        type: "rss-source",
        identifier: newSourceUrl.trim(),
        title: newSourceTitle.trim(),
        siteUrl: null,
        status: "active",
        weight: 1.0,
        syncCursor: null,
        firstImportedAt: new Date(),
        lastPolledAt: new Date(),
        lastSuccessfulSyncAt: new Date(),
        lastErrorAt: new Date(),
        lastErrorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setOptimisticSources({ type: "add", source: newSource });

      await addSource(newSourceUrl.trim(), newSourceTitle.trim());
      setNewSourceUrl("");
      setNewSourceTitle("");
    });
  };

  const handleToggleSource = (id: string, currentStatus: "active" | "paused" | "blocked") => {
    startTransition(async () => {
      setOptimisticSources({ type: "toggle", id, status: currentStatus });
      await toggleSourceStatus(id, currentStatus);
    });
  };

  const handleRemoveSource = (id: string) => {
    startTransition(async () => {
      setOptimisticSources({ type: "remove", id });
      await removeSource(id);
    });
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="sources-client"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="p-8 max-w-5xl mx-auto space-y-8"
      >
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Add New Source</CardTitle>
            <CardDescription>Connect a new RSS feed to your intelligence network.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddSource} className="flex flex-col sm:flex-row gap-4">
              <Input
                placeholder="Source Title (e.g. TechCrunch)"
                value={newSourceTitle}
                onChange={(e) => setNewSourceTitle(e.target.value)}
                className="flex-1"
                required
              />
              <Input
                placeholder="RSS Feed URL"
                value={newSourceUrl}
                type="url"
                onChange={(e) => setNewSourceUrl(e.target.value)}
                className="flex-[2]"
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
              className={`group transition-all border-border ${
                source.status === "active" ? "hover:border-primary/50" : "opacity-75"
              }`}
            >
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <Badge
                    variant={source.status === "active" ? "default" : "secondary"}
                    className={source.status === "active" ? "bg-primary text-primary-foreground" : ""}
                  >
                    {source.status}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleRemoveSource(source.id)}
                    disabled={isPending}
                  >
                    <AlertCircle size={16} />
                  </Button>
                </div>
                <CardTitle className="text-lg mt-2 truncate">{source.title}</CardTitle>
                <CardDescription className="truncate text-xs">{source.identifier}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button
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
      </motion.div>
    </AnimatePresence>
  );
}
