import { ArrowLeft, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { marked } from "marked";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDigestArchiveDetail } from "@/app/actions/digest-archive-actions";
import { buttonVariants } from "@/components/ui/button-variants";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type DigestArchiveDetailPageProps = {
  params: Promise<{
    date: string;
  }>;
};

function formatDigestDate(dateStr: string): string {
  const [year = 0, month = 1, day = 1] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

export default async function DigestArchiveDetailPage({ params }: DigestArchiveDetailPageProps) {
  const { date } = await params;

  // Validation for YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    notFound();
  }

  const detail = await getDigestArchiveDetail(date);

  if (!detail?.current.markdownBody) {
    notFound();
  }

  const { current, prevDate, nextDate } = detail;
  const htmlContent = marked.parse(current.markdownBody || "");

  return (
    <ScrollArea className="flex-1 w-full h-full bg-background">
      <div className="max-w-3xl mx-auto p-6 md:p-10 space-y-8 animate-in fade-in slide-in-from-bottom-2">
        <div className="flex items-center justify-between">
          <Link
            href="/digests"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-2 -ml-3 text-muted-foreground")}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Archives
          </Link>

          <div className="flex items-center gap-2">
            {prevDate ? (
              <Link
                href={`/digests/${prevDate}`}
                className={cn(buttonVariants({ variant: "outline", size: "icon" }))}
                title={`Previous: ${prevDate}`}
              >
                <ChevronLeft className="w-4 h-4" />
              </Link>
            ) : (
              <div
                className={cn(buttonVariants({ variant: "outline", size: "icon" }), "opacity-50 cursor-not-allowed")}
              >
                <ChevronLeft className="w-4 h-4" />
              </div>
            )}

            {nextDate ? (
              <Link
                href={`/digests/${nextDate}`}
                className={cn(buttonVariants({ variant: "outline", size: "icon" }))}
                title={`Next: ${nextDate}`}
              >
                <ChevronRight className="w-4 h-4" />
              </Link>
            ) : (
              <div
                className={cn(buttonVariants({ variant: "outline", size: "icon" }), "opacity-50 cursor-not-allowed")}
              >
                <ChevronRight className="w-4 h-4" />
              </div>
            )}
          </div>
        </div>

        <header className="space-y-4 pb-8 border-b border-border/50">
          <div className="flex items-center gap-2 text-primary">
            <Calendar className="w-5 h-5" />
            <span className="font-semibold tracking-tight uppercase text-sm">Daily Digest</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">日报 {date}</h1>
          <p className="text-muted-foreground">{formatDigestDate(date)}</p>
        </header>

        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Trusted markdown */}
        <div className="prose-custom pb-20" dangerouslySetInnerHTML={{ __html: htmlContent as string }} />
      </div>
    </ScrollArea>
  );
}
