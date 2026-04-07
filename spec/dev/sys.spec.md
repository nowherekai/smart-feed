# smart-feed 系统架构文档

**项目名称**: smart-feed  
**版本**: 0.4  
**创建日期**: 2026-04-01  
**更新时间**: 2026-04-07  
**文档状态**: Synced to Current Code

---

## 1. 架构概览

### 1.1 系统定位

smart-feed 当前是一个 **Next.js Web + BullMQ Worker + PostgreSQL + Redis** 的单体系统，面向单用户 RSS 情报处理场景。它既提供 Web 工作台，也提供后台定时与异步流水线。

### 1.2 当前运行形态

- **Web 进程**: Next.js App Router，承担页面渲染、Server Actions、一个 OPML 导出 Route Handler。
- **Worker 进程**: Bun 启动的 BullMQ Worker 集群入口，负责调度注册、队列消费、bull-board 服务。
- **数据库**: PostgreSQL，统一由 Drizzle ORM 访问。
- **队列**: Redis + BullMQ，承载内容流水线、Digest 流水线与来源导入任务。

### 1.3 核心设计原则

1. **Web 读写分离偏后台**: Web 主要负责配置、查询和触发动作，长耗时工作全部走 Worker。
2. **流水线状态显式化**: 通过 `content_items.status`、`digest_reports.status`、`pipeline_runs`、`step_runs` 保持过程可审计。
3. **原始层与加工层分离**: `content_item_raws` 保留原始正文，`content_items.cleaned_md` 保存标准化结果。
4. **规则优先于 AI**: 去重、时间窗口、状态推进先由规则决定，AI 只负责分类、评分和摘要。
5. **缓存优先**: AI 结果按 `(content_id, model_strategy, prompt_version)` 缓存。
6. **失败可降级**: 全文抓取失败时，若 RSS 原始内容可用，允许 fallback 继续处理。
7. **运维可观测**: bull-board、结构化日志、内容详情页运行轨迹共同构成观测面。

### 1.4 技术栈

| 层级 | 技术选型 | 当前用途 |
|------|---------|---------|
| Web 框架 | Next.js 16 + React 19 | App Router 页面、Server Actions、Route Handler |
| UI | Tailwind CSS 4 + shadcn/ui + Zustand | 前端页面与交互状态 |
| 运行时 | Bun | 本地开发、测试、worker 启动 |
| 数据库 | PostgreSQL | 业务数据、流水线审计数据 |
| ORM | Drizzle ORM | 类型安全数据库访问 |
| 队列 | BullMQ + Redis | 异步任务、调度、重试 |
| 监控入口 | bull-board + Express | worker 侧队列观测 |
| AI | AI SDK + OpenRouter Provider + Dummy Provider | 基础分析与深度摘要 |
| 邮件 | Nodemailer + SMTP | Digest 邮件投递 |
| 解析 | rss-parser + fast-xml-parser + linkedom + turndown | RSS/OPML 解析、HTML 抓取、Markdown 标准化 |

---

## 2. 系统架构

### 2.1 逻辑架构图

```text
┌──────────────────────────────────────────────────────┐
│                   Next.js Web App                    │
│ Dashboard / Sources / Analysis / Digest / Stats /   │
│ Original Content / Settings(placeholder)            │
└──────────────────────────┬───────────────────────────┘
                           │
                           │ Server Actions / Queries
                           ▼
┌──────────────────────────────────────────────────────┐
│                Application / Query Layer            │
│ source-actions / intelligence-actions /             │
│ original-content-actions / content-debug-actions    │
└───────────────┬───────────────────────┬─────────────┘
                │                       │
                ▼                       ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│      PostgreSQL          │  │      Redis + BullMQ      │
│ sources / content /      │  │ queues / schedulers /    │
│ analysis / digest / runs │  │ deduplication / retries  │
└───────────────▲──────────┘  └───────────────┬──────────┘
                │                             │
                │                             ▼
                │                 ┌────────────────────────┐
                │                 │      Worker App        │
                │                 │ source / content / ai /│
                │                 │ digest / legacy import │
                │                 └───────────┬────────────┘
                │                             │
                ▼                             ▼
┌──────────────────────────────────────────────────────┐
│                 External Dependencies                │
│ RSS Feeds / Original Pages / OpenRouter / SMTP      │
└──────────────────────────────────────────────────────┘
```

### 2.2 核心子系统

#### 2.2.1 Web 展示层
- **职责**: 页面渲染、用户交互、只读查询结果展示。
- **目录**: `src/app/*`、`src/components/*`
- **当前页面**:
  - `/`
  - `/sources`
  - `/original-content`
  - `/original-content/[contentId]`
  - `/analysis`
  - `/digest`
  - `/stats`
  - `/settings`
- **当前占位**:
  - `src/app/api/.gitkeep`
  - `src/app/admin/.gitkeep`
  - `src/app/digest/.gitkeep` 目录存在但页面由 `page.tsx` 承担

#### 2.2.2 应用动作与查询层
- **职责**: 连接前端与数据库/队列。
- **主要模块**:
  - `src/app/actions/source-actions.ts`
  - `src/app/actions/intelligence-actions.ts`
  - `src/app/actions/original-content-actions.ts`
  - `src/app/actions/content-debug-actions.ts`
  - `src/app/sources/export/route.ts`
- **当前边界特征**:
  - 主业务不是 API Routes 驱动，而是 Server Actions + 直接查询模块。
  - 唯一稳定 HTTP 接口是 OPML 导出 Route Handler。

#### 2.2.3 后台调度层
- **职责**: 注册周期任务，不直接执行业务。
- **实现**: `src/scheduler/jobs.ts`
- **当前任务**:
  - 每小时 `scheduler.sources.sync`，队列 `source-dispatch-queue`
  - 每日 `digest.compose`，队列 `digest-queue`

#### 2.2.4 Worker 执行层
- **职责**: 消费队列并执行业务处理器。
- **入口**: `src/workers/index.ts`
- **当前 Worker 切分**:
  - `source-dispatch-queue`
  - `ingestion-queue`
  - `content-queue`
  - `ai-queue`
  - `digest-queue`
  - legacy queue `smart-feed`（仅 `source.import`）

#### 2.2.5 内容服务层
- **职责**: 来源抓取、去重、时间窗口判定、全文抓取、标准化。
- **核心模块**:
  - `src/services/source.ts`
  - `src/services/source-import.ts`
  - `src/services/content.ts`
  - `src/services/html-fetcher.ts`
  - `src/services/normalizer.ts`

#### 2.2.6 AI 服务层
- **职责**: Provider 选择、Prompt 管理、基础分析、深度摘要。
- **核心模块**:
  - `src/ai/client.ts`
  - `src/ai/prompts.ts`
  - `src/services/analysis.ts`
- **运行模式**:
  - `disabled`
  - `dummy`
  - `openrouter`

#### 2.2.7 Digest 服务层
- **职责**: 计算窗口、筛选候选、渲染 Markdown、持久化日报、邮件投递。
- **核心模块**:
  - `src/services/digest.ts`
  - `src/services/digest-renderer.ts`
  - `src/services/digest-delivery.ts`

#### 2.2.8 观测与调试层
- **职责**: 队列监控、步骤追踪、内容级调试动作。
- **核心模块**:
  - `src/workers/bull-board.ts`
  - `src/services/pipeline-tracking.ts`
  - `src/services/pipeline-runtime.ts`
  - `src/services/digest-pipeline-runtime.ts`
  - `src/app/original-content/[contentId]/content-detail-actions.tsx`

---

## 3. 当前目录与边界

### 3.1 关键目录

```text
src/
├── ai/                # AI provider / prompt / schema / repair
├── app/               # Next.js 页面、Server Actions、Route Handler
├── components/        # UI 与 feature 组件
├── config/            # 应用环境变量
├── db/                # Drizzle client / schema / env
├── lib/               # 调试辅助、OPML 导出等
├── parsers/           # RSS / OPML 解析
├── pipeline/          # BullMQ handler 聚合与类型
├── queue/             # 队列配置、连接、环境
├── scheduler/         # Repeatable Job 注册
├── services/          # 业务核心逻辑
├── utils/             # logger、time、url 等工具
└── workers/           # Worker 入口与 bull-board
```

### 3.2 当前页面读模型

| 页面 | 主要数据来源 | 说明 |
|------|-------------|------|
| `/` | `analysis_records` | 只读 Top Intelligence 卡片 |
| `/sources` | `sources` + import runs | 来源管理与导入状态 |
| `/analysis` | `analysis_records` 去重查询 | 优先 full 的分析列表 |
| `/original-content` | `content_items + content_item_raws + sources` | 原始内容时间流 |
| `/original-content/[contentId]` | `content + raw + analysis + pipeline + digest relations` | 最完整的追踪视图 |
| `/digest` | `analysis_records(status=full)` | Web 摘要快照，不直接读取 `digest_reports` |
| `/stats` | 聚合 SQL | 漏斗、趋势、来源统计 |
| `/settings` | 无后端数据写入 | 当前静态占位 |

---

## 4. 数据架构

### 4.1 核心实体模型

```typescript
interface Source {
  id: string;
  type: "rss-source" | "podcast-source" | "newsletter-source" | "wechat-source" | "youtube-source";
  identifier: string;
  title: string | null;
  siteUrl: string | null;
  status: "active" | "paused" | "blocked";
  weight: number;
  syncCursor: SourceSyncCursor | null;
  firstImportedAt: Date | null;
  lastPolledAt: Date | null;
  lastSuccessfulSyncAt: Date | null;
  lastErrorAt: Date | null;
  lastErrorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ContentItem {
  id: string;
  sourceId: string;
  kind: "article" | "video-transcript" | "podcast-transcript" | "newsletter";
  status: "sentinel" | "raw" | "normalized" | "analyzed" | "digested" | "failed";
  externalId: string | null;
  title: string | null;
  author: string | null;
  originalUrl: string;
  normalizedOriginalUrl: string | null;
  originalUrlHash: string | null;
  mediaUrl: string | null;
  cleanedMd: string | null;
  publishedAt: Date | null;
  fetchedAt: Date;
  effectiveAt: Date;
  processingError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ContentItemRaw {
  id: string;
  contentId: string;
  format: "html" | "text" | "markdown" | "transcript";
  rawBody: string;
  rawExcerpt: string | null;
  rawPayload: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AnalysisRecord {
  id: string;
  contentId: string;
  sourceId: string;
  modelStrategy: string;
  promptVersion: string;
  categories: string[];
  keywords: string[];
  entities: string[];
  language: string | null;
  valueScore: number;
  summary: {
    summary: string;
    paragraphSummaries: string[];
  } | null;
  originalUrl: string;
  sourceName: string;
  sourceTraceId: string | null;
  contentTraceId: string | null;
  status: "basic" | "full";
  createdAt: Date;
}

interface DigestReport {
  id: string;
  period: "daily" | "weekly";
  digestDate: string;
  status: "draft" | "ready" | "sent" | "failed";
  windowStart: Date;
  windowEnd: Date;
  markdownBody: string | null;
  emailSubject: string | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface DigestItem {
  id: string;
  digestId: string;
  analysisRecordId: string;
  sectionTitle: string;
  rank: number;
  createdAt: Date;
}

interface SourceImportRun {
  id: string;
  mode: "single" | "opml";
  totalCount: number;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

interface SourceImportRunItem {
  id: string;
  importRunId: string;
  inputUrl: string;
  normalizedUrl: string | null;
  result: "created" | "skipped_duplicate" | "failed";
  sourceId: string | null;
  errorMessage: string | null;
  createdAt: Date;
}

interface PipelineRun {
  id: string;
  contentId: string | null;
  digestId: string | null;
  pipelineName: string;
  pipelineVersion: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

interface StepRun {
  id: string;
  pipelineRunId: string;
  stepName: string;
  inputRef: string | null;
  outputRef: string | null;
  status: "pending" | "running" | "completed" | "failed";
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}
```

### 4.2 当前仍在数据层预留的对象

```typescript
interface FeedbackSignal {
  id: string;
  targetType: "content" | "source" | "topic";
  targetId: string;
  signal:
    | "useful"
    | "useless"
    | "block"
    | "upweight"
    | "downweight"
    | "upweight_topic"
    | "downweight_topic"
    | "prefer_short"
    | "prefer_deep"
    | "prefer_action";
  reason: string | null;
  payload: Record<string, unknown> | null;
  createdAt: Date;
}
```

该表已存在于 schema，但当前没有 Web 入口，也没有编排/排序闭环使用它。

### 4.3 数据关系

```text
Source (1) ──────► (N) ContentItem
ContentItem (1) ─► (1) ContentItemRaw
ContentItem (1) ─► (N) AnalysisRecord
AnalysisRecord (N) ─► (N) DigestItem ─► (1) DigestReport
SourceImportRun (1) ─► (N) SourceImportRunItem
PipelineRun (1) ─► (N) StepRun
```

### 4.4 关键约束

1. `sources(type, identifier)` 唯一。
2. `content_items` 具备三层唯一约束：
   - `(source_id, external_id)` when not null
   - `(source_id, normalized_original_url)` when not null
   - `(source_id, original_url_hash)` when not null
3. `analysis_records(content_id, model_strategy, prompt_version)` 唯一。
4. `digest_reports(period, digest_date)` 唯一。
5. `digest_items(digest_id, analysis_record_id)` 唯一。

---

## 5. 队列与流水线架构

### 5.1 当前队列拓扑

| 队列名 | 任务 | 默认并发 |
|------|------|---------|
| `source-dispatch-queue` | `scheduler.sources.sync` | 1 |
| `ingestion-queue` | `source.fetch` | 2 |
| `content-queue` | `content.fetch-html`, `content.normalize` | 5 |
| `ai-queue` | `content.analyze.basic`, `content.analyze.heavy` | 1 |
| `digest-queue` | `digest.compose`, `digest.deliver` | 1 |
| `smart-feed` | `source.import` | 1 |

### 5.2 内容流水线

```text
source.import / scheduler
  -> source.fetch
  -> content.fetch-html
  -> content.normalize
  -> content.analyze.basic
  -> content.analyze.heavy (conditional)
```

#### 5.2.1 `source.fetch`
- 抓取 Feed，支持 304 / ETag / Last-Modified。
- 解析 RSS/Atom 项。
- 执行三级去重。
- 计算 `effectiveAt` 并判断时间窗口。
- 窗口内写入 `raw`，窗口外写入 `sentinel`。
- 仅 `raw` 内容入队 `content.fetch-html`。

#### 5.2.2 `content.fetch-html`
- 优先抓取原始页面 HTML。
- 成功时更新 `content_item_raws.rawBody`。
- 失败但 RSS 原始内容可用时，以 `completed_with_fallback` 继续。
- 失败且无 fallback 时写 `content_items.status="failed"`。

#### 5.2.3 `content.normalize`
- 选择正文根节点，移除噪音。
- HTML/文本转换为 Markdown。
- 追加标题和 Source 链接。
- 超长时截断。
- 完成后状态推进为 `normalized` 并入队 `content.analyze.basic`。

#### 5.2.4 `content.analyze.basic`
- 读取 `cleaned_md`。
- 根据 Provider 解析任务配置。
- 命中缓存则直接复用。
- 未命中时执行基础分析。
- 分数高于阈值才继续入队 `content.analyze.heavy`。

#### 5.2.5 `content.analyze.heavy`
- 必须依赖至少一条 basic 记录。
- 命中缓存则直接复用。
- 生成 `summary` 与 `paragraphSummaries`。
- 完成后写入 `analysis_records(status="full")`。

### 5.3 Digest 流水线

```text
scheduler
  -> digest.compose
  -> digest.deliver
```

#### 5.3.1 `digest.compose`
- 依据业务时区计算 `windowStart` / `windowEnd`。
- 查询窗口内的 `full` 分析记录。
- 过滤 `blocked` 来源与无效摘要。
- 对同一内容保留最新摘要。
- 按主分类分组渲染 Markdown。
- 持久化到 `digest_reports` / `digest_items`。

#### 5.3.2 `digest.deliver`
- 查找 `digest_reports`。
- 若已发送则幂等跳过。
- 若邮件开关关闭则跳过。
- 若启用邮件则经 SMTP 发送并写入 `sentAt` / `status="sent"`。

### 5.4 运行时追踪

- 内容流水线运行时名称: `content-processing`
- Digest 流水线运行时名称: `digest-generation`
- 每个步骤统一通过 runtime：
  - 创建或续用 `pipeline_run`
  - 创建 `step_run`
  - 记录输入输出 JSON
  - 自动透传 `pipelineRunId`
  - 在需要时自动入队下一个步骤

---

## 6. 调度、环境变量与运行配置

### 6.1 关键环境变量

| 变量 | 用途 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接 |
| `REDIS_URL` | BullMQ / Redis 连接 |
| `SMART_FEED_TIMEZONE` | 应用业务时区 |
| `SMART_FEED_TIME_WINDOW_HOURS` | 内容进入流水线的滚动时间窗口 |
| `SMART_FEED_DIGEST_TIMEZONE` | Digest 业务时区 |
| `SMART_FEED_DIGEST_SEND_HOUR` | 每日 Digest 发送小时 |
| `SMART_FEED_DIGEST_MAX_LOOKBACK_HOURS` | Digest 最大回溯窗口 |
| `SMART_FEED_VALUE_SCORE_THRESHOLD` | 自动进入 heavy 的基础分析阈值 |
| `SMART_FEED_AI_PROVIDER` | `dummy` / `openrouter` |
| `SMART_FEED_AI_BASIC_MODEL` | OpenRouter 基础分析模型 |
| `SMART_FEED_AI_HEAVY_MODEL` | OpenRouter 深度摘要模型 |
| `OPENROUTER_API_KEY` | OpenRouter 凭据 |
| `SMART_FEED_EMAIL_DELIVERY_ENABLED` | 是否启用邮件投递 |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` / `SMTP_TO` | SMTP 投递配置 |
| `SMART_FEED_BULL_BOARD_HOST` / `SMART_FEED_BULL_BOARD_PORT` | worker bull-board 监听配置 |

### 6.2 默认行为

- `SMART_FEED_TIMEZONE` 默认 `Asia/Shanghai`
- `SMART_FEED_TIME_WINDOW_HOURS` 默认 `72`
- `SMART_FEED_DIGEST_SEND_HOUR` 默认 `8`
- `SMART_FEED_DIGEST_MAX_LOOKBACK_HOURS` 默认 `48`
- `SMART_FEED_VALUE_SCORE_THRESHOLD` 默认 `6`
- bull-board 默认监听 `127.0.0.1:3010`

---

## 7. 当前已知差异、占位与非目标

### 7.1 已实现但容易误判的点

1. **Web Digest 页面不是持久化 Digest 报告的直出视图**  
   `/digest` 直接读取 `analysis_records(status="full")`，而后台邮件投递基于 `digest_reports` / `digest_items`。

2. **产品主业务边界不是 API Routes**  
   当前以 Server Actions 和查询模块为主，`src/app/api` 只是占位目录。

3. **来源状态 `blocked` 已被后台逻辑识别，但前台不能设置**  
   Digest 过滤和 schema 支持 `blocked`，Sources 页面只支持 `active / paused` 切换。

### 7.2 当前明确占位

- `/settings` 仅静态展示，不写入配置。
- `src/app/admin` 没有实际管理页面。
- `feedback_signals` 仅数据层预留。
- 非 RSS `source_type` 仅 schema 预留。

### 7.3 当前非目标

- 多租户与权限系统
- 公开 API
- 用户反馈驱动排序/风格学习
- 非文本源接入闭环
- Web 端手动执行 Digest 编排/投递

