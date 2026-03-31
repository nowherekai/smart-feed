import { eq } from "drizzle-orm";
import { getDb, sourceImportRunItems, sourceImportRuns } from "../db";
import { type ParsedOpmlSource, parseOpml } from "../parsers";
import { buildSourceFetchDeduplicationId, createQueue, jobNames } from "../queue";
import { logger } from "../utils";
import type { SourceFetchJobData } from "./content";
import {
  createSource,
  findSourceByIdentifier,
  type PreparedRssSource,
  type SourceRecord,
  verifyAndPrepareRssSource,
} from "./source";

type SourceImportRunRecord = typeof sourceImportRuns.$inferSelect;
type NewSourceImportRun = typeof sourceImportRuns.$inferInsert;
type SourceImportRunUpdate = Partial<Omit<NewSourceImportRun, "id">>;
type NewSourceImportRunItem = typeof sourceImportRunItems.$inferInsert;
type SourceImportRunItemRecord = typeof sourceImportRunItems.$inferSelect;
type SourceReference = Pick<SourceRecord, "id">;
type SourceImportRunReference = Pick<SourceImportRunRecord, "id">;
type SourceImportRunItemReference = Pick<SourceImportRunItemRecord, "id">;

export type SourceImportJobData =
  | {
      mode: "single";
      url: string;
    }
  | {
      mode: "opml";
      opml: string;
    };

export type SourceImportItemOutcome = {
  inputUrl: string;
  normalizedUrl: string | null;
  result: "created" | "skipped_duplicate" | "failed";
  sourceId: string | null;
  errorMessage: string | null;
};

export type SourceImportSummary = {
  importRunId: string;
  mode: "single" | "opml";
  totalCount: number;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  status: "completed" | "failed";
  items: SourceImportItemOutcome[];
};

export type SourceImportDeps = {
  createImportRun?: (data: NewSourceImportRun) => Promise<SourceImportRunReference>;
  updateImportRun?: (id: string, data: SourceImportRunUpdate) => Promise<void>;
  createImportRunItem?: (data: NewSourceImportRunItem) => Promise<SourceImportRunItemReference>;
  parseOpml?: (opml: string) => ParsedOpmlSource[];
  verifyRssSource?: (url: string) => Promise<PreparedRssSource>;
  findSourceByIdentifier?: (identifier: string) => Promise<SourceReference | null>;
  createSource?: (data: Parameters<typeof createSource>[0]) => Promise<SourceReference>;
  enqueueSourceFetch?: (data: SourceFetchJobData) => Promise<void>;
};

function requireInsertedRow<T>(row: T | undefined, entityName: string): T {
  if (!row) {
    throw new Error(`[services/source-import] Failed to insert ${entityName}.`);
  }

  return row;
}

async function createImportRun(data: NewSourceImportRun): Promise<SourceImportRunRecord> {
  const db = getDb();
  const [run] = await db.insert(sourceImportRuns).values(data).returning();

  return requireInsertedRow(run, "source import run");
}

async function updateImportRun(id: string, data: SourceImportRunUpdate): Promise<void> {
  if (Object.keys(data).length === 0) {
    return;
  }

  const db = getDb();
  await db.update(sourceImportRuns).set(data).where(eq(sourceImportRuns.id, id));
}

async function createImportRunItem(data: NewSourceImportRunItem): Promise<SourceImportRunItemRecord> {
  const db = getDb();
  const [item] = await db.insert(sourceImportRunItems).values(data).returning();

  return requireInsertedRow(item, "source import run item");
}

async function enqueueSourceFetch(data: SourceFetchJobData): Promise<void> {
  const queue = createQueue<SourceFetchJobData>();
  await queue.add(jobNames.sourceFetch, data, {
    deduplication: {
      id: buildSourceFetchDeduplicationId(data.sourceId),
    },
  });
}

function toFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown import error.";
}

function summarizeOutcomes(outcomes: SourceImportItemOutcome[]) {
  return outcomes.reduce(
    (summary, outcome) => {
      if (outcome.result === "created") {
        summary.createdCount += 1;
      } else if (outcome.result === "skipped_duplicate") {
        summary.skippedCount += 1;
      } else {
        summary.failedCount += 1;
      }

      return summary;
    },
    {
      createdCount: 0,
      skippedCount: 0,
      failedCount: 0,
    },
  );
}

async function processSingleUrl(
  importRunId: string,
  inputUrl: string,
  deps: Required<SourceImportDeps>,
): Promise<SourceImportItemOutcome> {
  try {
    const preparedSource = await deps.verifyRssSource(inputUrl);
    const existingSource = await deps.findSourceByIdentifier(preparedSource.normalizedUrl);

    if (existingSource) {
      return {
        inputUrl,
        normalizedUrl: preparedSource.normalizedUrl,
        result: "skipped_duplicate",
        sourceId: existingSource.id,
        errorMessage: null,
      };
    }

    const createdSource = await deps.createSource({
      type: "rss-source",
      identifier: preparedSource.normalizedUrl,
      title: preparedSource.title,
      siteUrl: preparedSource.siteUrl,
      status: "active",
      weight: 1,
      firstImportedAt: new Date(),
    });

    await deps.enqueueSourceFetch({
      sourceId: createdSource.id,
      importRunId,
      trigger: "source.import",
    });

    return {
      inputUrl,
      normalizedUrl: preparedSource.normalizedUrl,
      result: "created",
      sourceId: createdSource.id,
      errorMessage: null,
    };
  } catch (error) {
    logger.warn("source import item failed", {
      error: toFailureMessage(error),
      inputUrl,
      importRunId,
    });

    return {
      inputUrl,
      normalizedUrl: null,
      result: "failed",
      sourceId: null,
      errorMessage: toFailureMessage(error),
    };
  }
}

async function persistOutcome(
  importRunId: string,
  outcome: SourceImportItemOutcome,
  deps: Required<SourceImportDeps>,
): Promise<void> {
  await deps.createImportRunItem({
    importRunId,
    inputUrl: outcome.inputUrl,
    normalizedUrl: outcome.normalizedUrl,
    result: outcome.result,
    sourceId: outcome.sourceId,
    errorMessage: outcome.errorMessage,
  });
}

function buildDeps(overrides: SourceImportDeps): Required<SourceImportDeps> {
  return {
    createImportRun: overrides.createImportRun ?? createImportRun,
    updateImportRun: overrides.updateImportRun ?? updateImportRun,
    createImportRunItem: overrides.createImportRunItem ?? createImportRunItem,
    parseOpml: overrides.parseOpml ?? parseOpml,
    verifyRssSource: overrides.verifyRssSource ?? verifyAndPrepareRssSource,
    findSourceByIdentifier: overrides.findSourceByIdentifier ?? findSourceByIdentifier,
    createSource: overrides.createSource ?? createSource,
    enqueueSourceFetch: overrides.enqueueSourceFetch ?? enqueueSourceFetch,
  };
}

async function finalizeRun(
  runId: string,
  outcomes: SourceImportItemOutcome[],
  deps: Required<SourceImportDeps>,
): Promise<Pick<SourceImportSummary, "createdCount" | "skippedCount" | "failedCount" | "status">> {
  const counts = summarizeOutcomes(outcomes);
  const status: SourceImportSummary["status"] = "completed";

  await deps.updateImportRun(runId, {
    createdCount: counts.createdCount,
    skippedCount: counts.skippedCount,
    failedCount: counts.failedCount,
    status,
    finishedAt: new Date(),
  });

  return {
    ...counts,
    status,
  };
}

export async function runSourceImport(
  input: SourceImportJobData,
  overrides: SourceImportDeps = {},
): Promise<SourceImportSummary> {
  const deps = buildDeps(overrides);
  const startedAt = new Date();

  if (input.mode === "single") {
    const run = await deps.createImportRun({
      mode: "single",
      totalCount: 1,
      status: "running",
      startedAt,
    });
    const outcome = await processSingleUrl(run.id, input.url, deps);

    await persistOutcome(run.id, outcome, deps);
    const counts = await finalizeRun(run.id, [outcome], deps);

    return {
      importRunId: run.id,
      mode: "single",
      totalCount: 1,
      items: [outcome],
      ...counts,
    };
  }

  const run = await deps.createImportRun({
    mode: "opml",
    totalCount: 0,
    status: "running",
    startedAt,
  });

  try {
    const parsedSources = deps.parseOpml(input.opml);
    const urls = parsedSources.map((source) => source.xmlUrl);

    await deps.updateImportRun(run.id, {
      totalCount: urls.length,
    });

    const outcomes: SourceImportItemOutcome[] = [];

    for (const url of urls) {
      const outcome = await processSingleUrl(run.id, url, deps);
      outcomes.push(outcome);
      await persistOutcome(run.id, outcome, deps);
    }

    const counts = await finalizeRun(run.id, outcomes, deps);

    return {
      importRunId: run.id,
      mode: "opml",
      totalCount: urls.length,
      items: outcomes,
      ...counts,
    };
  } catch (error) {
    const errorMessage = toFailureMessage(error);

    await deps.updateImportRun(run.id, {
      failedCount: 1,
      status: "failed",
      finishedAt: new Date(),
    });

    throw new Error(`[services/source-import] OPML import failed: ${errorMessage}`);
  }
}
