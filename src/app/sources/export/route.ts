import { appEnv } from "@/config";
import { db } from "@/db";
import { buildSourcesOpml } from "@/lib/opml-export";
import { createLogger } from "@/utils";

export const dynamic = "force-dynamic";

const logger = createLogger("SourcesExportRoute");

function getExportDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(now);
}

export async function GET() {
  try {
    const rssSources = await db.query.sources.findMany({
      columns: {
        identifier: true,
        siteUrl: true,
        title: true,
      },
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      where: (table, { eq }) => eq(table.type, "rss-source"),
    });
    const opml = buildSourcesOpml(rssSources);
    const exportDate = getExportDate(new Date(), appEnv.timeZone);

    logger.info("Sources OPML export generated", {
      exportCount: rssSources.length,
      sourceType: "rss-source",
    });

    return new Response(opml, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="smart-feed-sources-${exportDate}.opml"`,
        "Content-Type": "text/x-opml+xml; charset=utf-8",
      },
      status: 200,
    });
  } catch (error) {
    logger.error("Failed to export sources OPML", {
      error: error instanceof Error ? error.message : "Unknown export error",
    });

    return new Response("Failed to export OPML.", { status: 500 });
  }
}
