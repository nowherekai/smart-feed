import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function SettingsPage() {
  return (
    <ScrollArea className="flex-1 w-full h-full">
      <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-2">
        <Card className="border-border">
          <CardHeader>
            <CardTitle>General Settings</CardTitle>
            <CardDescription>Manage your application preferences and data modes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
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
      </div>
    </ScrollArea>
  );
}
