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

/**
 * 来源同步游标类型定义
 * 用于记录 RSS 或其他来源的增量同步状态
 */
export type SourceSyncCursor = {
  etag?: string | null;
  lastModified?: string | null;
  /** 上次同步看到的外部 ID */
  lastSeenExternalId?: string | null;
  /** 上次同步看到的原始链接 */
  lastSeenOriginalUrl?: string | null;
  /** 上次同步看到的发布时间 */
  lastSeenPublishedAt?: string | null;
};

/**
 * AI 分析摘要结果类型定义
 */
export type AnalysisSummary = {
  /** 整体摘要 */
  summary: string;
  /** 段落摘要列表 */
  paragraphSummaries: string[];
};

/**
 * 反馈信号负载类型定义
 * 记录反馈对系统权重和策略的影响
 */
export type FeedbackPayload = {
  /** 应用的权重增量 */
  appliedWeightDelta?: number;
  /** 应用的主题键 */
  appliedTopicKey?: string;
  /** 应用的摘要风格偏好 */
  appliedSummaryStyle?: "prefer_short" | "prefer_deep" | "prefer_action";
  /** 备注信息 */
  note?: string;
};

// --- 枚举定义 ---

/** 信息源类型：RSS, Podcast, Newsletter 等 */
export const sourceTypeEnum = pgEnum("source_type", [
  "rss-source",
  "podcast-source",
  "newsletter-source",
  "wechat-source",
  "youtube-source",
]);

/** 信息源状态：激活、暂停、屏蔽 */
export const sourceStatusEnum = pgEnum("source_status", ["active", "paused", "blocked"]);

/** 内容种类：文章、视频转录、播客转录、Newsletter */
export const contentKindEnum = pgEnum("content_kind", [
  "article",
  "video-transcript",
  "podcast-transcript",
  "newsletter",
]);

/** 内容流水线处理状态 */
export const contentStatusEnum = pgEnum("content_status", [
  "sentinel", // 哨兵状态，仅记录存在，不进入流水线
  "raw", // 原始状态，待处理
  "normalized", // 已标准化（HTML 转 Markdown）
  "analyzed", // 已完成 AI 分析
  "digested", // 已编入摘要报告
  "failed", // 处理失败
]);

/** 原始内容格式 */
export const rawContentFormatEnum = pgEnum("raw_content_format", ["html", "text", "markdown", "transcript"]);

/** 分析记录状态：基础分析、完整深度分析 */
export const analysisStatusEnum = pgEnum("analysis_status", ["basic", "full"]);

/** 摘要报告周期：日报、周报 */
export const digestPeriodEnum = pgEnum("digest_period", ["daily", "weekly"]);

/** 摘要报告投递状态 */
export const digestStatusEnum = pgEnum("digest_status", ["draft", "ready", "sent", "failed"]);

/** 反馈目标类型 */
export const feedbackTargetTypeEnum = pgEnum("feedback_target_type", ["content", "source", "topic"]);

/** 反馈信号类型 */
export const feedbackSignalEnum = pgEnum("feedback_signal", [
  "useful", // 有用
  "useless", // 没用
  "block", // 屏蔽
  "upweight", // 增加权重
  "downweight", // 降低权重
  "upweight_topic", // 增加主题权重
  "downweight_topic", // 降低主题权重
  "prefer_short", // 偏好短摘要
  "prefer_deep", // 偏好深度分析
  "prefer_action", // 偏好行动导向
]);

/** 导入模式：单条或 OPML 批量 */
export const importModeEnum = pgEnum("import_mode", ["single", "opml"]);

/** 导入条目结果 */
export const importItemResultEnum = pgEnum("import_item_result", ["created", "skipped_duplicate", "failed"]);

/** 流水线/步骤运行状态 */
export const runStatusEnum = pgEnum("run_status", ["pending", "running", "completed", "failed"]);

// --- 表定义 ---

/**
 * 信息源表 (sources)
 * 存储所有的订阅源，是内容抓取的入口
 */
export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 来源类型 (如 rss-source) */
    type: sourceTypeEnum("type").notNull(),
    /** 来源唯一标识 (如 RSS URL) */
    identifier: text("identifier").notNull(),
    /** 显示名称 */
    title: varchar("title", { length: 255 }),
    /** 站点主页链接 */
    siteUrl: text("site_url"),
    /** 状态 */
    status: sourceStatusEnum("status").notNull().default("active"),
    /** 权重，用于内容排序和筛选 */
    weight: doublePrecision("weight").notNull().default(1),
    /** 同步游标，记录增量抓取状态 */
    syncCursor: jsonb("sync_cursor").$type<SourceSyncCursor | null>(),
    /** 首次导入时间 */
    firstImportedAt: timestamp("first_imported_at", {
      withTimezone: true,
      mode: "date",
    }),
    /** 上次轮询时间 */
    lastPolledAt: timestamp("last_polled_at", {
      withTimezone: true,
      mode: "date",
    }),
    /** 上次成功同步内容的时间 */
    lastSuccessfulSyncAt: timestamp("last_successful_sync_at", {
      withTimezone: true,
      mode: "date",
    }),
    /** 上次发生错误的时间 */
    lastErrorAt: timestamp("last_error_at", {
      withTimezone: true,
      mode: "date",
    }),
    /** 上次错误的详细信息 */
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

/**
 * 内容条目表 (content_items)
 * 存储从信息源抓取到的单条原始内容元数据
 */
export const contentItems = pgTable(
  "content_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 所属来源 ID */
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    /** 内容类型 */
    kind: contentKindEnum("kind").notNull().default("article"),
    /** 处理状态 */
    status: contentStatusEnum("status").notNull().default("raw"),
    /** 来源侧唯一 ID (如 RSS GUID) */
    externalId: varchar("external_id", { length: 512 }),
    /** 标题 */
    title: varchar("title", { length: 500 }),
    /** 作者 */
    author: varchar("author", { length: 255 }),
    /** 原始内容 URL */
    originalUrl: text("original_url").notNull(),
    /** 规范化后的 URL (用于去重) */
    normalizedOriginalUrl: text("normalized_original_url"),
    /** URL 哈希值 (备份去重方案) */
    originalUrlHash: varchar("original_url_hash", { length: 128 }),
    /** 媒体附件 URL (封面图等) */
    mediaUrl: text("media_url"),
    /** 清洗后的 Markdown 文本 */
    cleanedMd: text("cleaned_md"),
    /** 原始发布时间 */
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
    /** 系统抓取时间 */
    fetchedAt: timestamp("fetched_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    /** 业务生效时间 (published_at ?? fetched_at) */
    effectiveAt: timestamp("effective_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    /** 流水线处理错误信息 */
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
    /** 来源内外部 ID 唯一约束 */
    contentSourceExternalUnique: uniqueIndex("uniq_content_items_source_external_id")
      .on(table.sourceId, table.externalId)
      .where(sql`${table.externalId} is not null`),
    /** 来源内规范化 URL 唯一约束 */
    contentSourceNormalizedUrlUnique: uniqueIndex("uniq_content_items_source_normalized_original_url")
      .on(table.sourceId, table.normalizedOriginalUrl)
      .where(sql`${table.normalizedOriginalUrl} is not null`),
    /** 来源内 URL 哈希唯一约束 */
    contentSourceUrlHashUnique: uniqueIndex("uniq_content_items_source_original_url_hash")
      .on(table.sourceId, table.originalUrlHash)
      .where(sql`${table.originalUrlHash} is not null`),
  }),
);

/**
 * 原始内容详情表 (content_item_raws)
 * 存储抓取到的原始 HTML 或文本块，与 content_items 一对一
 */
export const contentItemRaws = pgTable(
  "content_item_raws",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 关联的内容 ID */
    contentId: uuid("content_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    /** 原始内容格式 */
    format: rawContentFormatEnum("format").notNull().default("html"),
    /** 原始全文内容 */
    rawBody: text("raw_body").notNull(),
    /** 原始摘要内容 (Feed 提供的摘要) */
    rawExcerpt: text("raw_excerpt"),
    /** 其他原始元数据载荷 */
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

/**
 * AI 分析记录表 (analysis_records)
 * 存储针对单篇内容的分析结果（分类、关键词、摘要等）
 */
export const analysisRecords = pgTable(
  "analysis_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 关联的内容 ID */
    contentId: uuid("content_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    /** 冗余关联来源 ID，方便快速查询 */
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    /** 使用的模型策略名称 (如 gpt-4o-mini) */
    modelStrategy: varchar("model_strategy", { length: 120 }).notNull(),
    /** Prompt 版本号 */
    promptVersion: varchar("prompt_version", { length: 64 }).notNull(),
    /** AI 分类 */
    categories: jsonb("categories").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** AI 关键词 */
    keywords: jsonb("keywords").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** AI 识别出的实体 */
    entities: jsonb("entities").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** 内容语种 */
    language: varchar("language", { length: 16 }),
    /** 价值评分 (0-10) */
    valueScore: integer("value_score").notNull(),
    /** 深度分析摘要负载 */
    summary: jsonb("summary").$type<AnalysisSummary | null>(),
    /** 冗余原文 URL (用于摘要展示) */
    originalUrl: text("original_url").notNull(),
    /** 冗余来源名称 */
    sourceName: varchar("source_name", { length: 255 }).notNull(),
    /** 来源可追溯 ID */
    sourceTraceId: text("source_trace_id"),
    /** 内容可追溯 ID */
    contentTraceId: text("content_trace_id"),
    /** 分析状态 */
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
    /** 同一内容在特定模型和 Prompt 下只能有一条记录 */
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

/**
 * 摘要报告表 (digest_reports)
 * 存储编排后的日报或周报
 */
export const digestReports = pgTable(
  "digest_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 报告周期类型 */
    period: digestPeriodEnum("period").notNull().default("daily"),
    /** 报告日期标识 (如: 2026-03-31) */
    digestDate: varchar("digest_date", { length: 10 }).notNull(),
    /** 状态 */
    status: digestStatusEnum("status").notNull().default("draft"),
    /** 统计窗口开始时间 */
    windowStart: timestamp("window_start", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    /** 统计窗口结束时间 */
    windowEnd: timestamp("window_end", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    /** 编排后的 Markdown 正文 */
    markdownBody: text("markdown_body"),
    /** 投递邮件标题 */
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
    /** 实际发送时间 */
    sentAt: timestamp("sent_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => ({
    /** 同一周期和日期只能有一份报告 */
    digestPeriodDateUnique: uniqueIndex("uniq_digest_reports_period_digest_date").on(table.period, table.digestDate),
    digestStatusIdx: index("idx_digest_reports_status").on(table.status),
    digestWindowIdx: index("idx_digest_reports_window_end").on(table.windowEnd),
  }),
);

/**
 * 摘要报告条目关联表 (digest_items)
 * 记录哪些分析结果被编入了哪份报告
 */
export const digestItems = pgTable(
  "digest_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 报告 ID */
    digestId: uuid("digest_id")
      .notNull()
      .references(() => digestReports.id, { onDelete: "cascade" }),
    /** 分析记录 ID */
    analysisRecordId: uuid("analysis_record_id")
      .notNull()
      .references(() => analysisRecords.id, { onDelete: "restrict" }),
    /** 在报告中的分类标题 */
    sectionTitle: varchar("section_title", { length: 120 }).notNull(),
    /** 排序权重 */
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

/**
 * 用户反馈信号表 (feedback_signals)
 * 记录用户对内容、来源或主题的反馈，用于后续策略调整
 */
export const feedbackSignals = pgTable(
  "feedback_signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 反馈对象类型 */
    targetType: feedbackTargetTypeEnum("target_type").notNull(),
    /** 反馈对象 ID */
    targetId: text("target_id").notNull(),
    /** 信号类型 */
    signal: feedbackSignalEnum("signal").notNull(),
    /** 反馈理由（可选） */
    reason: text("reason"),
    /** 反馈影响的详细载荷 */
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

/**
 * 来源导入运行记录表 (source_import_runs)
 * 记录单次批量导入（如 OPML）的汇总结果
 */
export const sourceImportRuns = pgTable(
  "source_import_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 导入模式 */
    mode: importModeEnum("mode").notNull(),
    /** 总计条目数 */
    totalCount: integer("total_count").notNull().default(0),
    /** 成功创建数 */
    createdCount: integer("created_count").notNull().default(0),
    /** 因重复跳过数 */
    skippedCount: integer("skipped_count").notNull().default(0),
    /** 导入失败数 */
    failedCount: integer("failed_count").notNull().default(0),
    /** 运行状态 */
    status: runStatusEnum("status").notNull().default("pending"),
    /** 开始时间 */
    startedAt: timestamp("started_at", {
      withTimezone: true,
      mode: "date",
    }),
    /** 完成时间 */
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

/**
 * 来源导入条目明细表 (source_import_run_items)
 * 记录单次批量导入中每一条记录的执行详情
 */
export const sourceImportRunItems = pgTable(
  "source_import_run_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 所属导入运行 ID */
    importRunId: uuid("import_run_id")
      .notNull()
      .references(() => sourceImportRuns.id, { onDelete: "cascade" }),
    /** 输入的原始 URL */
    inputUrl: text("input_url").notNull(),
    /** 规范化后的 URL */
    normalizedUrl: text("normalized_url"),
    /** 导入结果 */
    result: importItemResultEnum("result").notNull(),
    /** 若创建成功，关联的来源 ID */
    sourceId: uuid("source_id").references(() => sources.id, {
      onDelete: "set null",
    }),
    /** 错误信息 */
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

/**
 * 流水线运行记录表 (pipeline_runs)
 * 记录内容处理或摘要生成流水线的完整运行状态（属于审计实体）
 */
export const pipelineRuns = pgTable(
  "pipeline_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 关联的内容 ID（若是内容流水线） */
    contentId: uuid("content_id").references(() => contentItems.id, {
      onDelete: "set null",
    }),
    /** 关联的报告 ID（若是摘要流水线） */
    digestId: uuid("digest_id").references(() => digestReports.id, {
      onDelete: "set null",
    }),
    /** 流水线名称 (如 content-processing) */
    pipelineName: varchar("pipeline_name", { length: 64 }).notNull(),
    /** 流水线版本 */
    pipelineVersion: varchar("pipeline_version", { length: 32 }).notNull(),
    /** 状态 */
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

/**
 * 流水线步骤运行记录表 (step_runs)
 * 记录流水线内部单个步骤的执行情况（如 fetch-html, normalize）
 */
export const stepRuns = pgTable(
  "step_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 所属流水线运行 ID */
    pipelineRunId: uuid("pipeline_run_id")
      .notNull()
      .references(() => pipelineRuns.id, { onDelete: "cascade" }),
    /** 步骤名称 */
    stepName: varchar("step_name", { length: 64 }).notNull(),
    /** 输入引用标识 */
    inputRef: text("input_ref"),
    /** 输出引用标识 */
    outputRef: text("output_ref"),
    /** 状态 */
    status: runStatusEnum("status").notNull().default("pending"),
    /** 错误信息 */
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

// --- Inferred Types ---
export type Source = typeof sources.$inferSelect;
export type ContentItem = typeof contentItems.$inferSelect;
export type AnalysisRecord = typeof analysisRecords.$inferSelect;
export type DigestReport = typeof digestReports.$inferSelect;
