# smart-feed 系统架构文档

**项目名称**: smart-feed
**版本**: 0.3
**创建日期**: 2026-04-01
**文档状态**: Ready for Implementation (Updated for Multi-Worker Refactor)

---

## 1. 架构概览

### 1.1 系统定位

smart-feed 是一个个人情报处理系统，将用户配置的 RSS 订阅源转化为每日智能编排的摘要。

### 1.2 核心设计原则

1. **后台异步优先** - 抓取、分析、编排均在后台完成，Web 层仅负责配置与展示
2. **数据分离** - 原始数据与加工数据分表存储，支持重新处理
3. **可回链阅读** - 所有摘要结果必须保留来源名称与原文链接
4. **规则优先，AI 补洞** - 去重、过滤用规则，分类、摘要用 AI
5. **轻模型前置，重模型后置** - 先筛选后深度分析，控制成本
6. **模块解耦** - 前台、调度、Worker、AI 层、数据层清晰分离

### 1.3 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| **Web 框架** | Next.js | 全栈框架，支持 SSR/server actions/API Routes |
| **样式** | Tailwind CSS | 实用优先的 CSS 框架 |
| **UI 组件** | shadcn/ui | 可组合的 React 组件库 |
| **包管理** | Bun | 快速的 JavaScript 运行时与包管理器 |
| **数据库** | PostgreSQL | 本地开发用本地实例，生产用 Neon |
| **ORM** | Drizzle ORM | 类型安全的 TypeScript ORM |
| **任务队列** | BullMQ + Redis | 基于 Redis 的任务队列与调度 |
| **队列管理** | bull-board | 队列、重试、失败任务的可视化管理界面 |
| **AI 适配** | Vercel AI SDK | 统一的 LLM 接口抽象层 |

---

## 2. 系统架构

### 2.1 架构图

```
┌─────────────────────────────────────────────────────────┐
│                      Next.js Web                        │
│      来源管理 / Digest 查看 / 反馈 / bull-board 管理      │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP/API
                         ▼
┌─────────────────────────────────────────────────────────┐
│                   Application Layer                     │
│              API Routes / Business Logic                │
└───────┬─────────────────────────────────────────┬───────┘
        │                                         │
        ▼                                         ▼
┌──────────────────┐                    ┌─────────────────┐
│   PostgreSQL     │                    │   Redis +       │
│  数据持久化层     │                    │    BullMQ       │
└──────────────────┘                    │  任务队列/调度    │
        ▲                               └────────┬────────┘
        │                                        │
        │                                        ▼
        │                              ┌─────────────────┐
        │                              │  Worker Pool    │
        │                              │  (Multi-Queue)  │
        │                              └────────┬────────┘
        │                                       │
        └───────────────────────────────────────┘
                         
┌─────────────────────────────────────────────────────────┐
│                   External Systems                      │
│            RSS Feeds / LLM APIs / SMTP                  │
└─────────────────────────────────────────────────────────┘
```

### 2.2 核心子系统

#### 2.2.1 Web 层
- **职责**: 来源配置、状态查询、Digest 展示、反馈收集
- **技术**: Next.js App Router + React Server Components
- **不负责**: 长时间抓取、AI 调用、定时任务

#### 2.2.2 API 层
- **职责**: 业务逻辑封装、数据验证、任务入队
- **实现**: Next.js API Routes
- **关键接口**: 来源管理、Digest 查询、反馈提交

#### 2.2.3 调度层
- **职责**: 定时触发抓取信息与 Digest 生成
- **实现**: BullMQ repeatable jobs，跨队列路由到 `source-dispatch-queue` 和 `digest-queue`
- **触发规则**:
  - RSS 调度扫描: 每小时，运行在 `source-dispatch-queue`
  - Digest 生成: 每日 Digest 业务时区本地 08:00，运行在 `digest-queue`

#### 2.2.4 Worker 层
- **职责**: 执行 Pipeline 各阶段任务，按职能隔离队列与 Worker
- **实现**: 5 个独立职能队列及其对应的 Worker 实例
  - `source-dispatch-queue`: 扫描待同步源并扇出任务
  - `ingestion-queue`: RSS 抓取与初步入库
  - `content-queue`: HTML 抓取与正文提取转换
  - `ai-queue`: AI 评分与深度分析
  - `digest-queue`: 简报编排与邮件投递
- **特性**: 幂等、可重试、队列级并发控制（Concurrency）

#### 2.2.5 AI 适配层
- **职责**: 统一 LLM 调用接口
- **实现**: Vercel AI SDK
- **策略**: 轻模型筛选 + 重模型摘要

#### 2.2.6 队列管理层
- **职责**: 查看队列积压、失败任务、重试状态与运行健康度
- **实现**: bull-board，运行在 worker 进程独立端口，挂载全部 5 个职能队列，路径为 `/admin/queues`
- **约束**: 仅单用户或内部管理员可访问，不对公网匿名开放

---

## 3. 数据架构

命名约定：`id` / `source_id` / `content_id` / `digest_id` 等字段始终表示内部 UUID 或外键；`source_trace_id` / `content_trace_id` 表示面向用户展示与追踪的业务标识，可由业务字段派生，MVP 不要求单独持久化。

### 3.1 核心实体模型

```typescript
// 信息源
interface Source {
  id: string;                    // UUID
  type: "rss-source";            // MVP 仅支持 RSS
  identifier: string;            // 规范化 URL
  title?: string;                // 来源标题
  status: "active" | "paused" | "blocked";
  weight: number;                // 权重，默认 1.0
  last_successful_sync_at: Date | null; // 最近一次同步成功时间（调度过滤依据）
  last_polled_at: Date | null;    // 最近一次尝试抓取时间（仅供观测）
  created_at: Date;
  updated_at: Date;
}

// 内容单元
interface ContentItem {
  id: string;                    // UUID
  source_id: string;             // 关联 Source
  external_id?: string;          // RSS GUID，缺失或不稳定时回退 URL 级去重
  title: string;
  author?: string;
  raw_body: string;              // 原始 HTML
  cleaned_md: string | null;     // 清洗后 Markdown
  original_url: string;
  normalized_original_url?: string; // 规范化后的原文链接
  original_url_hash?: string;    // 链接哈希，用于 URL 级去重回退
  published_at?: Date;           // 原文发布时间，缺失时回退 fetched_at
  fetched_at: Date;              // 系统抓取时间
  status: "raw" | "normalized" | "analyzed" | "digested" | "failed";
}

// 分析记录
interface AnalysisRecord {
  id: string;
  content_id: string;
  model_strategy: string;        // 如 "haiku-basic"
  prompt_version: string;        // 提示词版本
  category: string[];            // 分类标签
  keywords: string[];
  entities?: string[];           // 实体抽取
  language?: string;
  value_score: number;           // 0-10
  summary: {
    summary: string;
    paragraphSummaries: string[];
  } | null;
  source_id: string;             // 冗余字段，便于查询
  source_name: string;
  source_trace_id?: string;      // 派生的对外追踪标识
  content_trace_id?: string;     // 派生的对外追踪标识
  original_url: string;
  status: "basic" | "full";
  created_at: Date;
}

// Digest 报告
interface Digest {
  id: string;
  digest_date: string;           // YYYY-MM-DD，表示发送日本地日期标签
  status: "draft" | "ready" | "sent" | "failed";
  markdown_body: string;
  created_at: Date;
  sent_at?: Date;
}

// Digest 条目关联
interface DigestItem {
  id: string;
  digest_id: string;
  analysis_id: string;
  section_title: string;         // 主题分组
  rank: number;                  // 排序
}

// 反馈信号
interface FeedbackSignal {
  id: string;
  target_type: "content" | "source" | "topic";
  target_id: string;
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
  created_at: Date;
}

// 导入任务记录
interface SourceImportRun {
  id: string;
  mode: "single" | "opml";
  total_count: number;
  created_count: number;
  skipped_count: number;
  failed_count: number;
  status: "pending" | "running" | "completed" | "failed";
  created_at: Date;
}

interface SourceImportRunItem {
  id: string;
  import_run_id: string;
  input_url: string;
  normalized_url?: string;
  result: "created" | "skipped_duplicate" | "failed";
  source_id?: string;
  error_message?: string;
  created_at: Date;
}

// Pipeline 执行记录
interface PipelineRun {
  id: string;
  content_id?: string;
  digest_id?: string;
  pipeline_name: string;
  pipeline_version: string;
  status: "pending" | "running" | "completed" | "failed";
  started_at?: Date;
  finished_at?: Date;
}

interface StepRun {
  id: string;
  pipeline_run_id: string;
  step_name: string;
  input_ref?: string;
  output_ref?: string;
  status: "pending" | "running" | "completed" | "failed";
  error_message?: string;
  started_at?: Date;
  finished_at?: Date;
}
```

### 3.2 数据关系

```
Source (1) ──────► (N) ContentItem
ContentItem (1) ──► (N) AnalysisRecord
AnalysisRecord (N) ◄──► (N) DigestItem ◄──► (1) Digest
FeedbackSignal (N) ────► (1) Source/ContentItem/Topic
```

### 3.3 关键约束

1. **唯一性约束**
   - `Source`: `type + identifier` 唯一
   - `ContentItem`: 应用层按 `(source_id, external_id)` → `(source_id, normalized_original_url)` → `(source_id, original_url_hash)` 的顺序查重
   - `ContentItem`: `(source_id, external_id)` 条件唯一（仅当 `external_id` 存在时生效）
   - `ContentItem`: `(source_id, normalized_original_url)` 条件唯一（仅当规范化 URL 存在时生效）
   - `ContentItem`: `(source_id, original_url_hash)` 条件唯一（仅当 URL 哈希存在时生效）
   - `AnalysisRecord`: `content_id + model_strategy + prompt_version` 唯一

2. **数据分离原则**
   - 加工层（`cleaned_md` / `AnalysisRecord`）不得回写覆盖原始层（`raw_body`）
   - 原始层内部，全文抓取可替代 feed 初始内容；feed 原始摘要通过 `rawExcerpt` 保留
   - `cleaned_md` 可重新生成
   - `AnalysisRecord` 支持多版本共存

3. **Digest 准入要求**
   - 进入 Digest 的 `AnalysisRecord` 必须包含:
     - `summary.summary`
     - `original_url`
     - `source_name`

4. **时间筛选窗口**
   - `effective_time = published_at ?? fetched_at`
   - 默认配置为 `SMART_FEED_TIME_WINDOW_HOURS=72` 与 `SMART_FEED_TIMEZONE=Asia/Shanghai`
   - 当 `effective_time >= now_in_app_timezone - TIME_WINDOW_HOURS` 时内容才进入标准化、AI 分析与 Digest 流水线
   - 若 `published_at` 与 `fetched_at` 都缺失，则条目不得进入后续流水线

5. **Digest 日期与统计区间**
   - 持久化时间使用 UTC 时间或 Unix timestamp；Digest 的日期标签、统计区间和发送时刻按本地业务时区计算
   - Digest 业务时区优先使用 `SMART_FEED_DIGEST_TIMEZONE`，未配置时回退 `SMART_FEED_TIMEZONE`，再回退机器时区
   - 默认发送时刻由 `SMART_FEED_DIGEST_SEND_HOUR=8` 定义
   - 本次统计区间为 `window_start = max(last_successful_digest_at, now_local_8am - 48h)`、`window_end = now_local_8am`
   - 最大回溯窗口由 `SMART_FEED_DIGEST_MAX_LOOKBACK_HOURS=48` 控制，超过上限时只发送最近 48 小时内容
   - `digest_date`、`daily:YYYY-MM-DD` 与邮件主题日期都表示发送日本地日期标签
   - 晚到内容只要其业务本地时间落在本次统计区间内，即归入本次 Digest

---

## 4. Pipeline 设计

### 4.1 核心 Pipeline

```
Source Ingestion Pipeline
  ├─ 1. Validate RSS URL
  ├─ 2. Check Duplication
  ├─ 3. Create Source Record
  └─ 4. Initialize Sync Sentinel

Content Processing Pipeline
  ├─ 1. Fetch RSS Feed
  ├─ 2. Parse Entries
  ├─ 3. Deduplicate by external_id / normalized_original_url / original_url_hash
  ├─ 4. Fetch HTML Content
  ├─ 5. Normalize to Markdown
  ├─ 6. Lightweight Analysis
  ├─ 7. Heavy Summary (conditional)
  └─ 8. Update Status

Digest Generation Pipeline
  ├─ 1. Collect Analysis Records
  ├─ 2. Apply Feedback Filters
  ├─ 3. Group by Category
  ├─ 4. Sort by Value Score
  ├─ 5. Generate Markdown
  └─ 6. Save Digest Record

Delivery Pipeline
  ├─ 1. Render Email Template
  ├─ 2. Send via SMTP
  └─ 3. Update Sent Status
```

### 4.2 任务类型与队列映射

项目内统一使用 `SmartFeedTaskName` 常量进行任务分发，通过 `taskToQueueMap` 自动路由。

| 任务名称 (Task Name) | 触发条件 | 目标队列 (Target Queue) | 说明 |
|-------------------|---------|-----------------------|------|
| `scheduler.sources.sync` | 定时调度 (1h) | `source-dispatch-queue` | 扫描 DB 并扇出 `source.fetch` |
| `source.fetch` | 调度扇出 | `ingestion-queue` | 抓取 RSS 并入库 ContentItem |
| `content.fetch-html` | 新 entry 发现 | `content-queue` | 抓取原文 HTML |
| `content.normalize` | HTML 抓取完成 | `content-queue` | 转换为 Markdown |
| `content.analyze.basic` | 标准化完成 | `ai-queue` | AI 基础评分与分类 |
| `content.analyze.heavy` | value_score > 6 | `ai-queue` | AI 深度摘要生成 |
| `digest.compose` | 每日定时 (8am) | `digest-queue` | 简报内容编排 |
| `digest.deliver` | Digest 生成完成 | `digest-queue` | 邮件投递 |
| `source.import` | 用户手动添加 | `smart-feed` (Legacy) | 兼容现有导入链路 |

### 4.3 任务执行规则

1. **队列路由**: 所有生产者通过 `getQueueForTask(taskName)` 获取目标队列，严禁硬编码队列名称。
2. **幂等性**: 同一输入多次执行结果一致。
3. **并发隔离**: 针对 AI 和 调度任务使用 `concurrency: 1` 确保顺序执行与限流；针对内容抓取使用更高并发。
4. **超时设置**:
   - 抓取任务: 30s
   - AI 分析: 60s
   - Digest 生成: 300s

---

## 5. AI 策略设计

### 5.1 分层处理策略

```
所有内容
  │
  ├─► 轻量分析 (Haiku)
  │   ├─ 分类
  │   ├─ 关键词
  │   ├─ 价值评分
  │   └─ 决策: value_score > 6?
  │
  └─► 重度摘要 (Sonnet)
      ├─ 一句话总结
      ├─ 三点要点
      ├─ 关注理由
      └─ 证据片段
```

### 5.2 模型配置

| 阶段 | 模型 | Token 限制 | 成本估算 |
|------|------|-----------|---------|
| 轻量分析 | Claude Haiku | 输入 4K / 输出 500 | ~$0.001/篇 |
| 重度摘要 | Claude Sonnet | 输入 8K / 输出 1K | ~$0.01/篇 |

### 5.3 Prompt 版本管理

```typescript
const PROMPT_VERSIONS = {
  "basic-analysis-v1": {
    system: "你是内容分析助手...",
    user: "分析以下内容: {content}",
    output_schema: BasicAnalysisSchema
  },
  "heavy-summary-v1": {
    system: "你是摘要生成助手...",
    user: "生成摘要: {content}",
    output_schema: HeavySummarySchema
  }
};
```

### 5.4 缓存策略

缓存键: `content_id + model_strategy + prompt_version`

- 命中缓存: 直接返回
- 未命中: 调用 API 并缓存结果
- `prompt_version` 变化时视为新版本并生成新的 `AnalysisRecord`，旧版本保留不覆盖
- `original_url_hash` 仅作为 URL 级去重回退键，不作为跨源全局唯一键
- 过期策略: 30 天未使用自动清理

---

## 6. API 设计

### 6.1 来源管理 API

```typescript
// 添加单个 RSS
POST /api/sources
Body: { url: string }
Response: { id: string, status: "active" }

// 批量导入 OPML
POST /api/sources/import-opml
Body: FormData (opml file)
Response: {
  run_id: string,
  total: number,
  created: number,
  skipped: number,
  failed: number
}

导入规则：
- 重复项计入 `skipped`，不计入 `failed`
- 非法源、解析失败或不可访问源计入 `failed`
- OPML 导入采用逐条处理，不因单条失败整批回滚
- `SourceImportRun` 保留汇总计数，`SourceImportRunItem` 保留逐条结果明细

// 查询来源列表
GET /api/sources
Query: { status?: "active" | "paused" | "blocked" }
Response: Source[]

// 更新来源状态
PATCH /api/sources/:id
Body: { status?: string, weight?: number }
Response: Source
```

### 6.2 Digest API

```typescript
// 获取最新 Digest
GET /api/digest/latest
Response: Digest & { items: DigestItem[] }

// 获取指定日期 Digest
GET /api/digest/:date
Response: Digest & { items: DigestItem[] }

// 获取内容详情
GET /api/content/:id
Response: ContentItem & { analysis: AnalysisRecord }
```

### 6.3 反馈 API

```typescript
// 提交反馈（后续迭代接口，非 MVP 当前交付）
POST /api/feedback
Body: {
  target_type: "content" | "source" | "topic",
  target_id: string,
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
    | "prefer_action"
}
Response: { success: boolean }
```

---

## 7. 目录结构

```
smart-feed/
├── src/
│   ├── app/                    # Next.js App Router
│   │   └── api/               # API Routes
│   ├── workers/
│   │   └── bull-board.ts      # worker 内部 bull-board 管理入口
│   ├── queue/                 # 队列基础设施
│   │   ├── config.ts          # 多队列路由与并发配置
│   │   ├── connection.ts      # 队列注册与 Worker 创建工厂
│   │   └── index.ts
│   ├── pipeline/              # Pipeline 逻辑
│   │   └── handlers/          # 职能任务处理器
│   ├── scheduler/             # 调度器实现
│   │   ├── jobs.ts            # 定时任务跨队列注册
│   │   └── index.ts
│   ├── services/              # 业务服务层
│   │   ├── pipeline-runtime.ts # 跨队列入队逻辑
│   │   └── source.ts          # 调度预过滤查询
│   ├── ai/                    # AI 适配层
│   └── workers/               # Worker 进程入口
│       └── index.ts           # 多 Worker 实例启动与优雅停机
├── drizzle/                   # Drizzle 迁移文件
```

---

## 8. 关键技术决策

### 8.1 为什么选择多队列分工？

- **避免队头阻塞 (HOLB)**: 海量 RSS 抓取任务不再阻塞准时性要求高的 Digest 生成任务。
- **精准并发策略**: AI 任务需要串行 (`concurrency: 1`) 以应对 RPM 限制，而 HTML 抓取可以并行提高效率。
- **可观测性提升**: 通过 bull-board 可以一眼看出是哪个环节（如 AI 或网络抓取）出现了积压。

### 8.2 调度预过滤机制

- **问题**: 频繁入队重复的 `source.fetch` 任务会导致 Redis 压力和不必要的计算。
- **方案**: 调度器在入队前通过 SQL 过滤：`last_successful_sync_at < NOW() - INTERVAL '1 hour'`，辅以 BullMQ 的 Job ID 去重，确保高效且幂等。

---

## 13. 监控与可观测性

### 13.1 队列可观测性

- **多队列看板**: 使用 bull-board 监控 `source-dispatch`, `ingestion`, `content`, `ai`, `digest` 全部 5 个队列。
- **健康度监控**: 重点关注 `ai-queue` 的任务等待时长和 `content-queue` 的失败率。

---

## 14. 性能优化

### 14.1 任务并发策略 (workerConcurrencyMap)

| 队列 | 并发数 (Concurrency) | 理由 |
|------|--------------------|------|
| `source-dispatch-queue` | 1 | 纯调度任务，禁止并发以防重复扇出 |
| `ingestion-queue` | 2 | RSS 抓取，网络 I/O 为主 |
| `content-queue` | 5 | 正文抓取与标准化，高并发提高吞吐 |
| `ai-queue` | 1 | AI 分析，严格串行防止触发 RPM 429 |
| `digest-queue` | 1 | 编排与投递，确保幂等与准时 |

---

**文档版本**: v0.3
**最后更新**: 2026-04-01
**维护者**: smart-feed 开发团队
