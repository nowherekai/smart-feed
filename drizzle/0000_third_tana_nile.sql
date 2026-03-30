CREATE TYPE "public"."analysis_status" AS ENUM('basic', 'full', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."content_kind" AS ENUM('article', 'video-transcript', 'podcast-transcript', 'newsletter');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('sentinel', 'raw', 'normalized', 'analyzed', 'digested', 'failed');--> statement-breakpoint
CREATE TYPE "public"."digest_period" AS ENUM('daily', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."digest_status" AS ENUM('draft', 'ready', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."feedback_signal" AS ENUM('useful', 'useless', 'block', 'upweight', 'downweight', 'upweight_topic', 'downweight_topic', 'prefer_short', 'prefer_deep', 'prefer_action');--> statement-breakpoint
CREATE TYPE "public"."feedback_target_type" AS ENUM('content', 'source', 'topic');--> statement-breakpoint
CREATE TYPE "public"."import_item_result" AS ENUM('created', 'skipped_duplicate', 'failed');--> statement-breakpoint
CREATE TYPE "public"."import_mode" AS ENUM('single', 'opml');--> statement-breakpoint
CREATE TYPE "public"."raw_content_format" AS ENUM('html', 'text', 'markdown', 'transcript');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('active', 'paused', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('rss-source', 'podcast-source', 'newsletter-source', 'wechat-source', 'youtube-source');--> statement-breakpoint
CREATE TABLE "analysis_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"model_strategy" varchar(120) NOT NULL,
	"prompt_version" varchar(64) NOT NULL,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"entities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"language" varchar(16),
	"sentiment" varchar(32),
	"value_score" integer NOT NULL,
	"summary" jsonb,
	"evidence_snippet" text,
	"original_url" text NOT NULL,
	"source_name" varchar(255) NOT NULL,
	"source_trace_id" text,
	"content_trace_id" text,
	"status" "analysis_status" DEFAULT 'basic' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "chk_analysis_records_value_score_range" CHECK ("analysis_records"."value_score" >= 0 and "analysis_records"."value_score" <= 10)
);
--> statement-breakpoint
CREATE TABLE "content_item_raws" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid NOT NULL,
	"format" "raw_content_format" DEFAULT 'html' NOT NULL,
	"raw_body" text NOT NULL,
	"raw_excerpt" text,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"kind" "content_kind" DEFAULT 'article' NOT NULL,
	"status" "content_status" DEFAULT 'raw' NOT NULL,
	"external_id" varchar(512),
	"title" varchar(500),
	"author" varchar(255),
	"original_url" text NOT NULL,
	"normalized_original_url" text,
	"original_url_hash" varchar(128),
	"media_url" text,
	"cleaned_md" text,
	"published_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"processing_error" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digest_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"digest_id" uuid NOT NULL,
	"analysis_record_id" uuid NOT NULL,
	"section_title" varchar(120) NOT NULL,
	"rank" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digest_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" "digest_period" DEFAULT 'daily' NOT NULL,
	"digest_date" varchar(10) NOT NULL,
	"status" "digest_status" DEFAULT 'draft' NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"markdown_body" text,
	"email_subject" varchar(255),
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "feedback_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" "feedback_target_type" NOT NULL,
	"target_id" text NOT NULL,
	"signal" "feedback_signal" NOT NULL,
	"reason" text,
	"payload" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid,
	"digest_id" uuid,
	"pipeline_name" varchar(64) NOT NULL,
	"pipeline_version" varchar(32) NOT NULL,
	"status" "run_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_import_run_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_run_id" uuid NOT NULL,
	"input_url" text NOT NULL,
	"normalized_url" text,
	"result" "import_item_result" NOT NULL,
	"source_id" uuid,
	"error_message" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "import_mode" NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"status" "run_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "source_type" NOT NULL,
	"identifier" text NOT NULL,
	"title" varchar(255),
	"site_url" text,
	"status" "source_status" DEFAULT 'active' NOT NULL,
	"weight" double precision DEFAULT 1 NOT NULL,
	"sync_cursor" jsonb,
	"first_imported_at" timestamp with time zone,
	"last_polled_at" timestamp with time zone,
	"last_successful_sync_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error_message" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "chk_sources_weight_non_negative" CHECK ("sources"."weight" >= 0)
);
--> statement-breakpoint
CREATE TABLE "step_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pipeline_run_id" uuid NOT NULL,
	"step_name" varchar(64) NOT NULL,
	"input_ref" text,
	"output_ref" text,
	"status" "run_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_records" ADD CONSTRAINT "analysis_records_content_id_content_items_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_records" ADD CONSTRAINT "analysis_records_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item_raws" ADD CONSTRAINT "content_item_raws_content_id_content_items_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_items" ADD CONSTRAINT "digest_items_digest_id_digest_reports_id_fk" FOREIGN KEY ("digest_id") REFERENCES "public"."digest_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_items" ADD CONSTRAINT "digest_items_analysis_record_id_analysis_records_id_fk" FOREIGN KEY ("analysis_record_id") REFERENCES "public"."analysis_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_content_id_content_items_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_digest_id_digest_reports_id_fk" FOREIGN KEY ("digest_id") REFERENCES "public"."digest_reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_import_run_items" ADD CONSTRAINT "source_import_run_items_import_run_id_source_import_runs_id_fk" FOREIGN KEY ("import_run_id") REFERENCES "public"."source_import_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_import_run_items" ADD CONSTRAINT "source_import_run_items_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_runs" ADD CONSTRAINT "step_runs_pipeline_run_id_pipeline_runs_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_analysis_records_content_id" ON "analysis_records" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "idx_analysis_records_source_id" ON "analysis_records" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "idx_analysis_records_status_created_at" ON "analysis_records" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_analysis_records_value_score" ON "analysis_records" USING btree ("value_score");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_analysis_records_content_strategy_prompt" ON "analysis_records" USING btree ("content_id","model_strategy","prompt_version");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_content_item_raws_content_id" ON "content_item_raws" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "idx_content_items_source_id" ON "content_items" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "idx_content_items_status" ON "content_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_content_items_effective_at" ON "content_items" USING btree ("effective_at");--> statement-breakpoint
CREATE INDEX "idx_content_items_source_effective_at" ON "content_items" USING btree ("source_id","effective_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_content_items_source_external_id" ON "content_items" USING btree ("source_id","external_id") WHERE "content_items"."external_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_content_items_source_normalized_original_url" ON "content_items" USING btree ("source_id","normalized_original_url") WHERE "content_items"."normalized_original_url" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_content_items_source_original_url_hash" ON "content_items" USING btree ("source_id","original_url_hash") WHERE "content_items"."original_url_hash" is not null;--> statement-breakpoint
CREATE INDEX "idx_digest_items_digest_id" ON "digest_items" USING btree ("digest_id");--> statement-breakpoint
CREATE INDEX "idx_digest_items_digest_rank" ON "digest_items" USING btree ("digest_id","rank");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_digest_items_digest_analysis" ON "digest_items" USING btree ("digest_id","analysis_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_digest_reports_period_digest_date" ON "digest_reports" USING btree ("period","digest_date");--> statement-breakpoint
CREATE INDEX "idx_digest_reports_status" ON "digest_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_digest_reports_window_end" ON "digest_reports" USING btree ("window_end");--> statement-breakpoint
CREATE INDEX "idx_feedback_signals_target" ON "feedback_signals" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "idx_feedback_signals_signal" ON "feedback_signals" USING btree ("signal");--> statement-breakpoint
CREATE INDEX "idx_feedback_signals_created_at" ON "feedback_signals" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_pipeline_runs_content_id" ON "pipeline_runs" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "idx_pipeline_runs_digest_id" ON "pipeline_runs" USING btree ("digest_id");--> statement-breakpoint
CREATE INDEX "idx_pipeline_runs_status" ON "pipeline_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_pipeline_runs_started_at" ON "pipeline_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_source_import_run_items_import_run_id" ON "source_import_run_items" USING btree ("import_run_id");--> statement-breakpoint
CREATE INDEX "idx_source_import_run_items_result" ON "source_import_run_items" USING btree ("result");--> statement-breakpoint
CREATE INDEX "idx_source_import_runs_status" ON "source_import_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_source_import_runs_created_at" ON "source_import_runs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_sources_type_identifier" ON "sources" USING btree ("type","identifier");--> statement-breakpoint
CREATE INDEX "idx_sources_status" ON "sources" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_sources_last_successful_sync_at" ON "sources" USING btree ("last_successful_sync_at");--> statement-breakpoint
CREATE INDEX "idx_step_runs_pipeline_run_id" ON "step_runs" USING btree ("pipeline_run_id");--> statement-breakpoint
CREATE INDEX "idx_step_runs_status" ON "step_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_step_runs_step_name" ON "step_runs" USING btree ("step_name");
