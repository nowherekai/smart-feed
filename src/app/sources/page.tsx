"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useFeedStore } from "@/lib/store";

export default function SourcesPage() {
  const sources = useFeedStore((state) => state.sources);
  const addSource = useFeedStore((state) => state.addSource);
  const removeSource = useFeedStore((state) => state.removeSource);
  const toggleSourceStatus = useFeedStore((state) => state.toggleSourceStatus);

  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceTitle, setNewSourceTitle] = useState("");

  const handleAddSource = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSourceUrl && newSourceTitle) {
      addSource(newSourceUrl, newSourceTitle);
      setNewSourceUrl("");
      setNewSourceTitle("");
    }
  };

  return (
    <ScrollArea className="flex-1 w-full h-full">
      <AnimatePresence mode="wait">
        <motion.div
          key="sources"
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
                <Button type="submit">Add Source</Button>
              </form>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sources.map((source) => (
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
                      onClick={() => removeSource(source.id)}
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
                    onClick={() => toggleSourceStatus(source.id)}
                  >
                    {source.status === "active" ? "Pause Sync" : "Resume Sync"}
                  </Button>
                </CardContent>
              </Card>
            ))}

            {sources.length === 0 && (
              <div className="col-span-full text-center py-12 text-muted-foreground bg-muted/10 rounded-xl border border-dashed border-border">
                No sources configured. Try adding an RSS feed above!
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </ScrollArea>
  );
}
