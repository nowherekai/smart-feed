import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export type SourceSyncCursor = {
  etag?: string | null;
  lastModified?: string | null;
  lastSeenExternalId?: string | null;
  lastSeenOriginalUrl?: string | null;
  lastSeenPublishedAt?: string | null;
};

export type AnalysisSummary = {
  oneline: string;
  points: string[];
  reason: string;
};

export type FeedbackPayload = {
  appliedWeightDelta?: number;
  appliedTopicKey?: string;
  appliedSummaryStyle?: "prefer_short" | "prefer_deep" | "prefer_action";
  note?: string;
};

export const sourceTypeEnum = pgEnum("source_type", [
  "rss-source",
  "podcast-source",
  "newsletter-source",
  "wechat-source",
  "youtube-source",
]);

export const sourceStatusEnum = pgEnum("source_status", ["active", "paused", "blocked"]);

export const contentKindEnum = pgEnum("content_kind", [
  "article",
  "video-transcript",
  "podcast-transcript",
  "newsletter",
]);

export const contentStatusEnum = pgEnum("content_status", [
  "sentinel",
  "raw",
  "normalized",
  "analyzed",
  "digested",
  "failed",
]);

export const rawContentFormatEnum = pgEnum("raw_content_format", ["html", "text", "markdown", "transcript"]);

export const analysisStatusEnum = pgEnum("analysis_status", ["basic", "full", "rejected"]);

export const digestPeriodEnum = pgEnum("digest_period", ["daily", "weekly"]);

export const digestStatusEnum = pgEnum("digest_status", ["draft", "ready", "sent", "failed"]);

export const feedbackTargetTypeEnum = pgEnum("feedback_target_type", ["content", "source", "topic"]);

export const feedbackSignalEnum = pgEnum("feedback_signal", [
  "useful",
  "useless",
  "block",
  "upweight",
  "downweight",
  "upweight_topic",
  "downweight_topic",
  "prefer_short",
  "prefer_deep",
  "prefer_action",
]);

export const importModeEnum = pgEnum("import_mode", ["single", "opml"]);

export const importItemResultEnum = pgEnum("import_item_result", ["created", "skipped_duplicate", "failed"]);

export const runStatusEnum = pgEnum("run_status", ["pending", "running", "completed", "failed"]);

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: sourceTypeEnum("type").notNull(),
    identifier: text("identifier").notNull(),
    title: varchar("title", { length: 255 }),
    siteUrl: text("site_url"),
    status: sourceStatusEnum("status").notNull().default("active"),
    weight: doublePrecision("weight").notNull().default(1),
    syncCursor: jsonb("sync_cursor").$type<SourceSyncCursor | null>(),
    firstImportedAt: timestamp("first_imported_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastPolledAt: timestamp("last_polled_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastSuccessfulSyncAt: timestamp("last_successful_sync_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastErrorAt: timestamp("last_error_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastErrorMessage: text("last_error_message"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    sourceTypeIdentifierUnique: uniqueIndex("uniq_sources_type_identifier").on(table.type, table.identifier),
    sourceStatusIdx: index("idx_sources_status").on(table.status),
    sourceSyncIdx: index("idx_sources_last_successful_sync_at").on(table.lastSuccessfulSyncAt),
    sourceWeightCheck: check("chk_sources_weight_non_negative", sql`${table.weight} >= 0`),
  }),
);

export const contentItems = pgTable(
  "content_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    kind: contentKindEnum("kind").notNull().default("article"),
    status: contentStatusEnum("status").notNull().default("raw"),
    externalId: varchar("external_id", { length: 512 }),
    title: varchar("title", { length: 500 }),
    author: varchar("author", { length: 255 }),
    originalUrl: text("original_url").notNull(),
    normalizedOriginalUrl: text("normalized_original_url"),
    originalUrlHash: varchar("original_url_hash", { length: 128 }),
    mediaUrl: text("media_url"),
    cleanedMd: text("cleaned_md"),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
    fetchedAt: timestamp("fetched_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    effectiveAt: timestamp("effective_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    processingError: text("processing_error"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    contentSourceIdx: index("idx_content_items_source_id").on(table.sourceId),
    contentStatusIdx: index("idx_content_items_status").on(table.status),
    contentEffectiveIdx: index("idx_content_items_effective_at").on(table.effectiveAt),
    contentSourceEffectiveIdx: index("idx_content_items_source_effective_at").on(table.sourceId, table.effectiveAt),
    contentSourceExternalUnique: uniqueIndex("uniq_content_items_source_external_id")
      .on(table.sourceId, table.externalId)
      .where(sql`${table.externalId} is not null`),
    contentSourceNormalizedUrlUnique: uniqueIndex("uniq_content_items_source_normalized_original_url")
      .on(table.sourceId, table.normalizedOriginalUrl)
      .where(sql`${table.normalizedOriginalUrl} is not null`),
    contentSourceUrlHashUnique: uniqueIndex("uniq_content_items_source_original_url_hash")
      .on(table.sourceId, table.originalUrlHash)
      .where(sql`${table.originalUrlHash} is not null`),
  }),
);

export const contentItemRaws = pgTable(
  "content_item_raws",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentId: uuid("content_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    format: rawContentFormatEnum("format").notNull().default("html"),
    rawBody: text("raw_body").notNull(),
    rawExcerpt: text("raw_excerpt"),
    rawPayload: jsonb("raw_payload"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    rawContentUnique: uniqueIndex("uniq_content_item_raws_content_id").on(table.contentId),
  }),
);

export const analysisRecords = pgTable(
  "analysis_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentId: uuid("content_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    modelStrategy: varchar("model_strategy", { length: 120 }).notNull(),
    promptVersion: varchar("prompt_version", { length: 64 }).notNull(),
    categories: jsonb("categories").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    keywords: jsonb("keywords").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    entities: jsonb("entities").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    language: varchar("language", { length: 16 }),
    sentiment: varchar("sentiment", { length: 32 }),
    valueScore: integer("value_score").notNull(),
    summary: jsonb("summary").$type<AnalysisSummary | null>(),
    evidenceSnippet: text("evidence_snippet"),
    originalUrl: text("original_url").notNull(),
    sourceName: varchar("source_name", { length: 255 }).notNull(),
    sourceTraceId: text("source_trace_id"),
    contentTraceId: text("content_trace_id"),
    status: analysisStatusEnum("status").notNull().default("basic"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    analysisContentIdx: index("idx_analysis_records_content_id").on(table.contentId),
    analysisSourceIdx: index("idx_analysis_records_source_id").on(table.sourceId),
    analysisStatusCreatedIdx: index("idx_analysis_records_status_created_at").on(table.status, table.createdAt),
    analysisScoreIdx: index("idx_analysis_records_value_score").on(table.valueScore),
    analysisContentStrategyUnique: uniqueIndex("uniq_analysis_records_content_strategy_prompt").on(
      table.contentId,
      table.modelStrategy,
      table.promptVersion,
    ),
    analysisValueScoreCheck: check(
      "chk_analysis_records_value_score_range",
      sql`${table.valueScore} >= 0 and ${table.valueScore} <= 10`,
    ),
  }),
);

export const digestReports = pgTable(
  "digest_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    period: digestPeriodEnum("period").notNull().default("daily"),
    digestDate: varchar("digest_date", { length: 10 }).notNull(),
    status: digestStatusEnum("status").notNull().default("draft"),
    windowStart: timestamp("window_start", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    windowEnd: timestamp("window_end", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    markdownBody: text("markdown_body"),
    emailSubject: varchar("email_subject", { length: 255 }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
    sentAt: timestamp("sent_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => ({
    digestPeriodDateUnique: uniqueIndex("uniq_digest_reports_period_digest_date").on(table.period, table.digestDate),
    digestStatusIdx: index("idx_digest_reports_status").on(table.status),
    digestWindowIdx: index("idx_digest_reports_window_end").on(table.windowEnd),
  }),
);

export const digestItems = pgTable(
  "digest_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    digestId: uuid("digest_id")
      .notNull()
      .references(() => digestReports.id, { onDelete: "cascade" }),
    analysisRecordId: uuid("analysis_record_id")
      .notNull()
      .references(() => analysisRecords.id, { onDelete: "restrict" }),
    sectionTitle: varchar("section_title", { length: 120 }).notNull(),
    rank: integer("rank").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    digestItemDigestIdx: index("idx_digest_items_digest_id").on(table.digestId),
    digestItemDigestRankIdx: index("idx_digest_items_digest_rank").on(table.digestId, table.rank),
    digestItemDigestAnalysisUnique: uniqueIndex("uniq_digest_items_digest_analysis").on(
      table.digestId,
      table.analysisRecordId,
    ),
  }),
);

export const feedbackSignals = pgTable(
  "feedback_signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetType: feedbackTargetTypeEnum("target_type").notNull(),
    targetId: text("target_id").notNull(),
    signal: feedbackSignalEnum("signal").notNull(),
    reason: text("reason"),
    payload: jsonb("payload").$type<FeedbackPayload | null>(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    feedbackTargetIdx: index("idx_feedback_signals_target").on(table.targetType, table.targetId),
    feedbackSignalIdx: index("idx_feedback_signals_signal").on(table.signal),
    feedbackCreatedIdx: index("idx_feedback_signals_created_at").on(table.createdAt),
  }),
);

export const sourceImportRuns = pgTable(
  "source_import_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mode: importModeEnum("mode").notNull(),
    totalCount: integer("total_count").notNull().default(0),
    createdCount: integer("created_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    status: runStatusEnum("status").notNull().default("pending"),
    startedAt: timestamp("started_at", {
      withTimezone: true,
      mode: "date",
    }),
    finishedAt: timestamp("finished_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    importRunStatusIdx: index("idx_source_import_runs_status").on(table.status),
    importRunCreatedIdx: index("idx_source_import_runs_created_at").on(table.createdAt),
  }),
);

export const sourceImportRunItems = pgTable(
  "source_import_run_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importRunId: uuid("import_run_id")
      .notNull()
      .references(() => sourceImportRuns.id, { onDelete: "cascade" }),
    inputUrl: text("input_url").notNull(),
    normalizedUrl: text("normalized_url"),
    result: importItemResultEnum("result").notNull(),
    sourceId: uuid("source_id").references(() => sources.id, {
      onDelete: "set null",
    }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    importRunItemRunIdx: index("idx_source_import_run_items_import_run_id").on(table.importRunId),
    importRunItemResultIdx: index("idx_source_import_run_items_result").on(table.result),
  }),
);

export const pipelineRuns = pgTable(
  "pipeline_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentId: uuid("content_id").references(() => contentItems.id, {
      onDelete: "set null",
    }),
    digestId: uuid("digest_id").references(() => digestReports.id, {
      onDelete: "set null",
    }),
    pipelineName: varchar("pipeline_name", { length: 64 }).notNull(),
    pipelineVersion: varchar("pipeline_version", { length: 32 }).notNull(),
    status: runStatusEnum("status").notNull().default("pending"),
    startedAt: timestamp("started_at", {
      withTimezone: true,
      mode: "date",
    }),
    finishedAt: timestamp("finished_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    pipelineRunContentIdx: index("idx_pipeline_runs_content_id").on(table.contentId),
    pipelineRunDigestIdx: index("idx_pipeline_runs_digest_id").on(table.digestId),
    pipelineRunStatusIdx: index("idx_pipeline_runs_status").on(table.status),
    pipelineRunStartedIdx: index("idx_pipeline_runs_started_at").on(table.startedAt),
  }),
);

export const stepRuns = pgTable(
  "step_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pipelineRunId: uuid("pipeline_run_id")
      .notNull()
      .references(() => pipelineRuns.id, { onDelete: "cascade" }),
    stepName: varchar("step_name", { length: 64 }).notNull(),
    inputRef: text("input_ref"),
    outputRef: text("output_ref"),
    status: runStatusEnum("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", {
      withTimezone: true,
      mode: "date",
    }),
    finishedAt: timestamp("finished_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    stepRunPipelineIdx: index("idx_step_runs_pipeline_run_id").on(table.pipelineRunId),
    stepRunStatusIdx: index("idx_step_runs_status").on(table.status),
    stepRunStepIdx: index("idx_step_runs_step_name").on(table.stepName),
  }),
);
