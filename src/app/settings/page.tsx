"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useFeedStore } from "@/lib/store";

export default function SettingsPage() {
  const mockMode = useFeedStore((state) => state.mockMode);
  const setMockMode = useFeedStore((state) => state.setMockMode);

  return (
    <ScrollArea className="flex-1 w-full h-full">
      <AnimatePresence mode="wait">
        <motion.div
          key="settings"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="p-8 max-w-5xl mx-auto space-y-8"
        >
          <Card className="border-border">
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Manage your application preferences and data modes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Demo Mode (Mock Data)</p>
                  <p className="text-sm text-muted-foreground">
                    Use built-in mock data for testing UI without a backend.
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {mockMode && <CheckCircle2 className="text-green-500 w-5 h-5" />}
                  <Switch checked={mockMode} onCheckedChange={setMockMode} />
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between opacity-50 cursor-not-allowed">
                <div>
                  <p className="font-medium text-foreground">Digest Time</p>
                  <p className="text-sm text-muted-foreground">When to generate your daily report.</p>
                </div>
                <Badge variant="outline" className="text-muted-foreground border-border">
                  08:00 AM
                </Badge>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>
    </ScrollArea>
  );
}
