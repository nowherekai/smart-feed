# smart-feed 产品需求规格书

**项目名称**: smart-feed  
**版本**: 0.2  
**创建日期**: 2026-03-30  
**更新时间**: 2026-04-07  
**文档状态**: Synced to Current Code

---

## 1. 产品环境 (Product Environment)

### 1.1 产品定位与当前实现
- **正式命名**: `smart-feed`
- **产品定位**: 面向单用户知识工作者的 RSS 情报处理工作台，把订阅源转换为可浏览、可追踪、可定时投递的智能摘要。
- **当前实现状态**: 项目已从“仅后台原型”演进为“Next.js Web + BullMQ Worker”的单体系统，已实现来源管理、内容流水线、AI 双阶段分析、日报编排与邮件投递、统计视图、原始内容追踪与调试入口。
- **当前 Web 页面**:
  - `/` Dashboard: 展示 Top Intelligence
  - `/sources`: 单条 RSS、OPML 后台导入、OPML 导出、来源暂停/恢复、删除
  - `/original-content`: 原始内容列表与筛选
  - `/original-content/[contentId]`: 内容详情、分析记录、流水线轨迹、Digest 关联、AI 调试动作
  - `/analysis`: 去重后的分析结果分页列表
  - `/digest`: 基于完整摘要记录的 Web 快照页
  - `/stats`: 内容漏斗、趋势、来源产出统计
  - `/settings`: 静态占位页，当前无实际配置写入能力

### 1.2 主要行动者 (Primary Agents)

| Agent | 类型 | 主要目标 | 当前感知方式 |
| :--- | :--- | :--- | :--- |
| **人类用户** | Human | 配置 RSS 来源、浏览摘要、检查原文、查看处理状态 | Sources 页面、Dashboard、Analysis、Original Feeds、Stats、Digest 页面 |
| **Worker / 调度代理** | System | 定时扫描来源、串联抓取到投递的后台流水线 | BullMQ 队列、定时任务、数据库状态、结构化日志 |
| **AI 分析代理** | AI | 对标准化内容做基础分析与深度摘要 | `cleaned_md`、来源名称、原文链接、Prompt 版本、模型配置 |
| **开发/运维操作者** | Human | 检查队列、查看流水线与步骤记录、手动重跑分析 | 内容详情调试动作、worker bull-board、服务端日志 |

---

## 2. 核心可供性目录 (Core Affordance Catalog)

### 2.1 主要可供性 (Primary)
- **P1 来源接入与导出**: 支持单条 RSS 校验导入、OPML 批量导入、全量 RSS OPML 导出。
- **P2 内容采集与窗口门控**: 支持 RSS 抓取、三级去重、时间窗口过滤、哨兵落库、全文抓取与标准化。
- **P3 AI 双阶段分析**: 支持基础分析与深度摘要两段式处理，并按缓存键复用已有结果。
- **P4 后台 Digest 编排与邮件投递**: 支持每日生成 `digest_reports` / `digest_items`，并在开启邮件配置时通过 SMTP 投递。
- **P5 情报浏览与追溯**: 支持 Dashboard、Analysis、Original Content、Stats 等只读视图，以及单篇内容的分析/流水线/Digest 关联查看。
- **P6 调试与运行观测**: 支持内容级 AI 重跑、流水线运行追踪、worker 侧 bull-board 队列观测。

### 2.2 次要与潜在可供性 (Secondary & Latent)
- **S1 OPML 后台导入进度轮询**: OPML 导入不是同步阻塞流程，前端会轮询导入 run 状态并展示已处理数量。
- **S2 Web Digest 快照**: `/digest` 当前读取的是最新完整分析记录集合，不直接读取持久化的 `digest_reports` Markdown。
- **S3 AI Provider 切换**: 支持 `dummy` 与 `openrouter` 两类 Provider；未配置时 AI 阶段直接失败而不是静默跳过。
- **L1 多来源类型预留**: 数据库枚举预留了 `podcast-source`、`newsletter-source`、`wechat-source`、`youtube-source`，但当前产品入口仅支持 RSS。
- **L2 反馈模型预留**: 数据层已包含 `feedback_signals`，但当前没有用户可触达的反馈 UI 或编排闭环。

---

## 3. 最小可供性故事 (Minimum Affordance Stories)

### MAS-1: 配置并维护 RSS 来源
- **主题**: 用户通过 Sources 页面建立、暂停、恢复、删除和导出 RSS 来源。
- **核心序列**:
  1. 用户输入单条 RSS URL，系统执行 URL 与 Feed 有效性校验。
  2. 若来源不存在则创建 `source` 并立即触发首次抓取；若已存在则返回重复结果。
  3. 用户也可上传 OPML，系统创建后台导入 run 并异步执行。
  4. 用户可导出当前全部 RSS 来源为 OPML 文件。
- **心理动机**: **自主性**，来源清单由用户显式决定。

### MAS-2: 内容在时间窗口内进入处理流水线
- **主题**: 系统对来源内容做去重、窗口判定与状态推进。
- **核心序列**:
  1. 调度器每小时扫描需要同步的 `active` 来源。
  2. Worker 抓取 Feed，并按 `external_id -> normalized_original_url -> original_url_hash` 去重。
  3. 系统计算 `effective_at = published_at ?? fetched_at`。
  4. 命中窗口的内容以 `raw` 状态入队后续步骤；超出窗口的内容仅以 `sentinel` 状态保留为哨兵。
- **心理动机**: **秩序感**，用户相信系统只处理“现在值得处理”的内容。

### MAS-3: 内容被 AI 分析并可被人工复查
- **主题**: 标准化后的内容先做基础分析，再按阈值进入深度摘要。
- **核心序列**:
  1. `content.normalize` 产出 `cleaned_md`。
  2. `content.analyze.basic` 生成分类、关键词、实体、语言和价值分。
  3. 当 `value_score > SMART_FEED_VALUE_SCORE_THRESHOLD` 时，系统继续执行 `content.analyze.heavy`。
  4. 用户可在内容详情页查看分析记录，并以 `new-record` 或 `overwrite` 方式重跑基础分析、重型摘要或完整 AI 流程。
- **心理动机**: **精通感**，用户既能消费 AI 结果，也能检查和重跑它。

### MAS-4: Digest 在后台被编排并按条件投递
- **主题**: 系统按业务时区计算日报窗口，生成 Markdown 报告并尝试邮件投递。
- **核心序列**:
  1. 调度器在 Digest 时区本地 `SMART_FEED_DIGEST_SEND_HOUR` 触发 `digest.compose`。
  2. 系统从窗口内筛选 `status="full"` 且摘要可渲染的分析记录。
  3. 系统按主分类分组渲染 Markdown，写入 `digest_reports` 与 `digest_items`。
  4. 若开启 `SMART_FEED_EMAIL_DELIVERY_ENABLED=true`，则继续执行 `digest.deliver`；否则投递步骤记录为跳过。
- **心理动机**: **连续性**，系统在固定节奏下输出每日情报。

### MAS-5: 用户浏览情报并追踪内容处理历史
- **主题**: 用户在 Web 端浏览摘要、原始内容、统计信息，并追踪单篇内容的处理轨迹。
- **核心序列**:
  1. Dashboard 展示高价值摘要卡片。
  2. Analysis 页面按 `content_id` 去重后分页展示分析结果。
  3. Original Content 列表支持时间范围与来源筛选。
  4. 内容详情页可查看原始正文、清洗 Markdown、分析记录、流水线步骤、Digest 关联。
  5. Stats 页面展示内容漏斗、来源产出和趋势。
- **心理动机**: **信任感**，用户可以看到结果，也可以追溯结果从何而来。

---

## 4. 环境约束与 Traceability 规范

### 4.1 当前实现约束

| 约束类型 | 详细要求 |
| :--- | :--- |
| **来源范围** | 当前产品入口只支持 `rss-source`；其它来源类型仅存在于 schema 预留中。 |
| **导入方式** | 单条 RSS 为同步校验 + 入库；OPML 为后台导入 run，前端轮询进度。 |
| **状态入口** | Web 当前只提供 `active <-> paused` 切换与删除；`blocked` 状态存在于数据层与 Digest 过滤逻辑中，但没有前台设置入口。 |
| **时间窗口** | 只有 `effective_at = published_at ?? fetched_at` 命中窗口的内容才会进入后续流水线；否则保留为 `sentinel`。 |
| **原始与加工分离** | 原始内容保存在 `content_item_raws`，标准化结果保存在 `content_items.cleaned_md`，两层分开管理。 |
| **全文抓取降级** | 页面 HTML 抓取失败时，若 RSS 原始正文/摘要仍可用，则允许以 fallback 方式继续标准化和后续分析。 |
| **AI 运行前置条件** | 没有 `cleaned_md` 时不允许进入 AI；未配置 AI Provider 时，分析步骤失败并写入 `processing_error`。 |
| **邮件投递开关** | 未开启 `SMART_FEED_EMAIL_DELIVERY_ENABLED` 时，Digest 会被编排并持久化，但邮件步骤跳过。 |
| **Web/API 边界** | 当前主业务入口是 App Router + Server Actions；`src/app/api` 仅为空目录占位。 |
| **配置页面** | `/settings` 仅为静态展示，不持久化业务配置。 |

时间窗口定义：应用统一使用业务时区计算窗口，默认 `SMART_FEED_TIMEZONE=Asia/Shanghai`，默认窗口 `SMART_FEED_TIME_WINDOW_HOURS=72`。判断规则为 `effective_at >= now_in_app_timezone - TIME_WINDOW_HOURS`。迟到文章只要落在窗口内，后续同步仍可进入流水线。

Digest 窗口定义：Digest 时区优先使用 `SMART_FEED_DIGEST_TIMEZONE`，否则回退 `SMART_FEED_TIMEZONE`。发送时刻默认 `SMART_FEED_DIGEST_SEND_HOUR=8`。统计窗口为 `window_start = max(last_sent_digest_at, now_local_send_hour - SMART_FEED_DIGEST_MAX_LOOKBACK_HOURS)`，`window_end = now_local_send_hour`。`digest_date` 表示发送日标签，而不是自然日全量区间。

### 4.2 当前可追溯性要求
当前代码中的最小可追溯闭环不是“证据片段强约束”，而是以下字段与视图组合：
- `analysis_records` 持久化 `content_id`、`source_id`、`source_name`、`original_url`、`model_strategy`、`prompt_version`。
- `content_items` 持久化 `effective_at`、`status`、`processing_error`。
- `pipeline_runs` / `step_runs` 持久化步骤输入、输出、状态、错误信息与时间戳。
- 内容详情页聚合展示原始正文、清洗正文、分析记录、Digest 关联与流水线步骤。

### 4.3 非可供性 (Non-Affordances - 当前未落地)
1. 当前没有用户反馈入口，也没有基于反馈动态调整排序或摘要风格的闭环。
2. 当前没有面向公网的管理后台；bull-board 仅运行在 worker 进程独立端口。
3. 当前没有通过 Web 手动触发 Digest 编排/投递的入口。
4. 当前没有真正可写的设置中心。
5. 当前没有 Podcast、Newsletter、视频转录等非 RSS 内容接入流程。

---

## 5. 领域对象与数据模型

### 5.1 当前核心实体接口 (TypeScript)

```typescript
interface Source {
  id: string;
  type: "rss-source" | "podcast-source" | "newsletter-source" | "wechat-source" | "youtube-source";
  identifier: string;
  title: string | null;
  siteUrl: string | null;
  status: "active" | "paused" | "blocked";
  weight: number;
  syncCursor: {
    etag?: string | null;
    lastModified?: string | null;
    lastSeenExternalId?: string | null;
    lastSeenOriginalUrl?: string | null;
    lastSeenPublishedAt?: string | null;
  } | null;
  firstImportedAt: Date | null;
  lastPolledAt: Date | null;
  lastSuccessfulSyncAt: Date | null;
  lastErrorAt: Date | null;
  lastErrorMessage: string | null;
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
  cleanedMd: string | null;
  publishedAt: Date | null;
  fetchedAt: Date;
  effectiveAt: Date;
  processingError: string | null;
}

interface ContentItemRaw {
  contentId: string;
  format: "html" | "text" | "markdown" | "transcript";
  rawBody: string;
  rawExcerpt: string | null;
  rawPayload: Record<string, unknown> | null;
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
}

interface DigestItem {
  digestId: string;
  analysisRecordId: string;
  sectionTitle: string;
  rank: number;
}

interface SourceImportRun {
  id: string;
  mode: "single" | "opml";
  totalCount: number;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  status: "pending" | "running" | "completed" | "failed";
}

interface PipelineRun {
  id: string;
  contentId?: string | null;
  digestId?: string | null;
  pipelineName: string;
  pipelineVersion: string;
  status: "pending" | "running" | "completed" | "failed";
}

interface StepRun {
  id: string;
  pipelineRunId: string;
  stepName: string;
  inputRef: string | null;
  outputRef: string | null;
  status: "pending" | "running" | "completed" | "failed";
  errorMessage: string | null;
}
```

### 5.2 关键实现约束
- `sources`: `(type, identifier)` 唯一。
- `content_items`: 通过 `(source_id, external_id)`、`(source_id, normalized_original_url)`、`(source_id, original_url_hash)` 三层唯一约束去重。
- `analysis_records`: `(content_id, model_strategy, prompt_version)` 唯一。
- `digest_reports`: `(period, digest_date)` 唯一。
- `digest_items`: `(digest_id, analysis_record_id)` 唯一。

---

## 6. 感知通道与反馈层级

### 6.1 当前反馈机制
- **Immediate**: 添加 RSS、删除来源、切换来源状态时，前端直接 toast 反馈。
- **Progressive**: OPML 导入通过 run 状态轮询展示“已处理 / 总数 / 已新增 / 已存在 / 失败”。
- **Operational**: 内容详情页、结构化日志、bull-board 提供后台执行反馈。
- **Missing**: 当前没有“内容有用/没用”“屏蔽来源”“摘要风格偏好”等终端用户反馈闭环。

### 6.2 当前主要感知通道

| 可供性 | 人类通道 | 系统通道 |
| :--- | :--- | :--- |
| 来源导入 | `/sources` 表单、文件选择、导出按钮 | Server Actions + `source.import` / `source.fetch` |
| 情报浏览 | Dashboard、Analysis、Digest、Original Feeds、Stats | Drizzle 查询与视图模型转换 |
| 内容追踪 | 内容详情页 | `pipeline_runs` / `step_runs` / `digest_items` |
| 队列观测 | worker bull-board | `/admin/queues` |

---

## 7. 验收标准 (Acceptance Criteria)

### 7.1 来源与导入
- **AC-1**: 提交有效 RSS URL 时，系统应完成 Feed 校验、去重判断，并返回 `created` 或 `skipped_duplicate` 结果。
- **AC-2**: OPML 导入必须以后台 run 形式执行，前端可轮询 `pending/running/completed/failed` 状态与逐步统计。
- **AC-3**: OPML 导出应导出当前全部 `rss-source` 记录，输出合法 OPML 2.0 文件附件。

### 7.2 内容流水线
- **AC-4**: 抓取来源时必须支持 304 Not Modified，并更新来源同步游标。
- **AC-5**: 超出时间窗口的文章必须以 `sentinel` 状态保留，不进入 HTML 抓取、标准化和 AI 阶段。
- **AC-6**: HTML 抓取失败但 RSS 原文仍可用时，流水线应以 fallback 方式继续进入标准化。

### 7.3 AI 分析
- **AC-7**: 基础分析必须生成 `categories`、`keywords`、`entities`、`language`、`valueScore` 并按缓存键复用已有结果。
- **AC-8**: 只有当基础分析分数大于阈值时，自动流程才会继续进入深度摘要。
- **AC-9**: 内容详情页必须允许对单篇内容手动重跑基础分析、重型摘要或完整 AI 流程。

### 7.4 Digest 与浏览
- **AC-10**: `digest.compose` 必须把筛选后的完整摘要持久化到 `digest_reports` 与 `digest_items`。
- **AC-11**: 当邮件开关关闭时，Digest 仍应成功生成，但 `digest.deliver` 返回跳过。
- **AC-12**: Analysis 页面必须按 `content_id` 去重，优先展示 `status="full"` 的最新记录。
- **AC-13**: 内容详情页必须展示分析记录、流水线步骤和 Digest 关联。

