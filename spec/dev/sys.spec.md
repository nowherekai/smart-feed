# smart-feed 系统架构文档

**项目名称**: smart-feed
**版本**: 0.2
**创建日期**: 2026-03-30
**文档状态**: Ready for Implementation

---

## 1. 架构概览

### 1.1 系统定位

smart-feed 是一个个人情报处理系统，将用户配置的 RSS 订阅源转化为每日可追溯的智能摘要。

### 1.2 核心设计原则

1. **后台异步优先** - 抓取、分析、编排均在后台完成，Web 层仅负责配置与展示
2. **数据分离** - 原始数据与加工数据分表存储，支持重新处理
3. **可追溯性** - 所有 AI 结论必须关联来源、原文链接与证据片段
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
        │                              │  Pipeline 执行   │
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
- **实现**: BullMQ repeatable jobs / job scheduler
- **触发规则**:
  - RSS 抓取: 每小时
  - Digest 生成: 每日 Digest 业务时区本地 08:00

#### 2.2.4 Worker 层
- **职责**: 执行 Pipeline 各阶段任务
- **实现**: BullMQ Worker 进程
- **特性**: 幂等、可重试、并发控制

#### 2.2.5 AI 适配层
- **职责**: 统一 LLM 调用接口
- **实现**: Vercel AI SDK
- **策略**: 轻模型筛选 + 重模型摘要

#### 2.2.6 队列管理层
- **职责**: 查看队列积压、失败任务、重试状态与运行健康度
- **实现**: bull-board，挂载到 Next.js 内部管理路由（如 `/admin/queues`）
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
  sentiment?: string;
  value_score: number;           // 0-10
  summary: {
    oneline: string;
    points: string[];
    reason: string;
  } | null;
  evidence_snippet: string | null;
  source_id: string;             // 冗余字段，便于查询
  source_name: string;
  source_trace_id?: string;      // 派生的对外追踪标识
  content_trace_id?: string;     // 派生的对外追踪标识
  original_url: string;
  status: "basic" | "full" | "rejected";
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

3. **可追溯性要求**
   - 进入 Digest 的 `AnalysisRecord` 必须包含:
     - `source_trace_id` + `source_name`
     - `content_trace_id`
     - `original_url`
     - `evidence_snippet`

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

### 4.2 任务类型

| Job Type | 触发条件 | 输入 | 输出 |
|----------|---------|------|------|
| `source.import` | 用户添加来源 | RSS URL / OPML | Source 记录 |
| `source.fetch` | 定时调度 | source_id | ContentItem 列表 |
| `content.fetch-html` | 新 entry 发现 | content_id | raw_body |
| `content.normalize` | HTML 抓取完成 | content_id | cleaned_md |
| `content.analyze.basic` | 标准化完成 | content_id | AnalysisRecord (basic) |
| `content.analyze.heavy` | value_score > 6 | content_id | AnalysisRecord (full) |
| `digest.compose` | 每日定时 | date_range | Digest |
| `digest.deliver` | Digest 生成完成 | digest_id | 邮件发送记录 |

### 4.3 任务执行规则

1. **幂等性**: 同一输入多次执行结果一致
2. **重试策略**: 失败任务最多重试 3 次，指数退避
3. **并发控制**: 同一 `content_id` 的任务串行执行
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
    output_schema: SummarySchema
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
│   │   ├── page.tsx           # 首页
│   │   ├── sources/           # 来源管理页面
│   │   ├── digest/            # Digest 查看页面
│   │   ├── admin/
│   │   │   └── queues/        # bull-board 管理入口
│   │   └── api/               # API Routes
│   │       ├── sources/
│   │       ├── digest/
│   │       └── feedback/
│   ├── lib/                   # 核心业务逻辑
│   │   ├── db/               # 数据库配置与 Schema
│   │   │   ├── schema.ts
│   │   │   └── client.ts
│   │   ├── queue/            # 任务队列
│   │   │   ├── bullmq.ts
│   │   │   ├── scheduler.ts
│   │   │   ├── board.ts
│   │   │   └── workers.ts
│   │   ├── pipeline/         # Pipeline 实现
│   │   │   ├── source-ingestion.ts
│   │   │   ├── content-processing.ts
│   │   │   ├── digest-generation.ts
│   │   │   └── delivery.ts
│   │   ├── ai/               # AI 适配层
│   │   │   ├── client.ts
│   │   │   ├── prompts.ts
│   │   │   └── cache.ts
│   │   └── utils/            # 工具函数
│   ├── components/           # React 组件
│   │   ├── ui/              # shadcn/ui 组件
│   │   └── features/        # 业务组件
│   └── workers/             # Worker 进程入口
│       └── index.ts
├── drizzle/                 # Drizzle 迁移文件
├── public/
├── .env.example
├── drizzle.config.ts
├── package.json
├── tsconfig.json
└── bun.lockb
```

---

## 8. 关键技术决策

### 8.1 为什么选择 Redis + BullMQ + bull-board？

- Redis 队列吞吐更高，适合抓取、清洗、分析这类 I/O 密集后台任务
- BullMQ 原生支持延迟任务、重试、优先级、并发控制与 repeatable jobs
- Worker 与 Web 可独立扩缩容，不会把任务压力压到 PostgreSQL
- bull-board 可直接提供失败任务查看、手动重试与积压监控，降低运维成本

**代价**:
- 需要额外维护 Redis 基础设施
- 需要处理 Redis 连接、持久化与队列监控

### 8.2 为什么选择 Vercel AI SDK？

- 统一的 LLM 接口抽象
- 支持多模型切换（Claude、GPT、Gemini）
- 不依赖 Vercel 平台部署

### 8.3 为什么选择 Drizzle ORM？

- 类型安全，TypeScript 原生支持
- 轻量级，无运行时开销
- 迁移管理简单

### 8.4 首次导入哨兵机制

**问题**: 首次导入 RSS 可能包含大量历史内容，全部分析成本高

**方案**:
- 首次导入仅保存少量原始条目作为同步哨兵
- 仅记录 `external_id`、`original_url`、`published_at`，必要时补充 `normalized_original_url`、`original_url_hash` 与 `fetched_at`
- 首次导入允许为全部条目建立哨兵，但只有命中时间窗口的条目才进入后续 pipeline
- 后续同步时，继续按 `effective_time = published_at ?? fetched_at` 与滚动时间窗口判定
- 迟到文章只要 `effective_time` 仍在时间窗口内，仍可进入后续处理

---

## 9. 可追溯性实现

### 9.1 追溯链路

```
用户看到摘要
  ↓
点击来源名称 → 查看 Source 详情
  ↓
点击原文链接 → 跳转到原始网页
  ↓
查看证据片段 → 验证 AI 结论
```

### 9.2 校验规则

```typescript
function canEnterDigest(record: AnalysisRecord): boolean {
  return Boolean(
    record.source_trace_id &&
    record.source_name &&
    record.content_trace_id &&
    record.original_url &&
    record.evidence_snippet
  );
}
```

邮件反馈协议（GET / POST、签名 token、过期时间、重复点击幂等、单用户模式下的入口鉴权）暂不在本轮规格定义，待反馈入口进入实施范围时单独补规格。

### 9.3 证据片段生成

1. AI 生成摘要时要求返回引用片段
2. 系统验证片段是否存在于 `cleaned_md`
3. 若不存在，降级为规则抽取（取前 200 字符）

---

## 10. 反馈驱动机制

### 10.1 反馈类型与效果

| 反馈信号 | 目标类型 | 立即效果 | 下轮效果 |
|---------|---------|---------|---------|
| `useful` | content | 记录偏好 | 提升同源/同主题权重 |
| `useless` | content | 记录偏好 | 降低同源/同主题权重 |
| `block` | source | 更新 status | 完全过滤该来源 |
| `upweight` | source | 提高来源权重 | 下一轮编排中该来源排序前移、出现频率上升 |
| `downweight` | source | 降低来源权重 | 下一轮编排中该来源排序后移、出现频率下降 |
| `upweight_topic` | topic | 提高主题权重 | 下一轮 digest 中该主题占比提升 |
| `downweight_topic` | topic | 降低主题权重 | 下一轮 digest 中该主题占比下降 |
| `prefer_short` | content | 更新用户配置 | 切换短摘要模板 |
| `prefer_deep` | content | 更新用户配置 | 启用深度分析模式 |
| `prefer_action` | content | 更新用户配置 | 切换行动导向摘要模板 |

### 10.2 权重调整算法

```typescript
function adjustSourceWeight(
  currentWeight: number,
  signal: "upweight" | "downweight"
): number {
  const delta = signal === "upweight" ? 0.1 : -0.1;
  return Math.max(0.1, Math.min(2.0, currentWeight + delta));
}
```

### 10.3 生效时机

- 反馈提交: 后续迭代中写入 `feedback_signals` 表
- Digest 编排: 后续迭代中读取最新反馈并应用过滤/排序规则
- 缓存复用: 已有分析结果可复用，但排序必须重新计算

---

## 11. 部署架构

### 11.1 开发环境

```yaml
services:
  web:
    command: bun run dev
    ports: ["3000:3000"]
    environment:
      - REDIS_URL=redis://redis:6379

  worker:
    command: bun run worker
    environment:
      - REDIS_URL=redis://redis:6379

  postgres:
    image: postgres:16
    ports: ["5432:5432"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
```

### 11.2 生产环境

**推荐方案**: Docker Compose

```yaml
services:
  web:
    image: smart-feed:latest
    command: bun run start
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - AI_API_KEY=${AI_API_KEY}
      - SMART_FEED_TIME_WINDOW_HOURS=${SMART_FEED_TIME_WINDOW_HOURS}
      - SMART_FEED_TIMEZONE=${SMART_FEED_TIMEZONE}
      - SMART_FEED_DIGEST_TIMEZONE=${SMART_FEED_DIGEST_TIMEZONE}
      - SMART_FEED_DIGEST_SEND_HOUR=${SMART_FEED_DIGEST_SEND_HOUR}
      - SMART_FEED_DIGEST_MAX_LOOKBACK_HOURS=${SMART_FEED_DIGEST_MAX_LOOKBACK_HOURS}

  worker:
    image: smart-feed:latest
    command: bun run worker
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - AI_API_KEY=${AI_API_KEY}
      - SMART_FEED_TIME_WINDOW_HOURS=${SMART_FEED_TIME_WINDOW_HOURS}
      - SMART_FEED_TIMEZONE=${SMART_FEED_TIMEZONE}
      - SMART_FEED_DIGEST_TIMEZONE=${SMART_FEED_DIGEST_TIMEZONE}
      - SMART_FEED_DIGEST_SEND_HOUR=${SMART_FEED_DIGEST_SEND_HOUR}
      - SMART_FEED_DIGEST_MAX_LOOKBACK_HOURS=${SMART_FEED_DIGEST_MAX_LOOKBACK_HOURS}

  postgres:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redisdata:/data
```

**云端方案**:
- 数据库: Neon (PostgreSQL 托管)
- Redis: Upstash / Redis Cloud / 云厂商托管 Redis
- 应用: 任意支持 Docker 的平台
- 邮件: SMTP 服务（如 SendGrid）

---

## 12. 安全考虑

### 12.1 数据安全

- 敏感配置使用环境变量
- API Key 不写入代码
- 数据库连接使用 SSL
- 单用户时间窗口配置通过 `SMART_FEED_TIME_WINDOW_HOURS` 与 `SMART_FEED_TIMEZONE` 管理
- 单用户 Digest 配置通过 `SMART_FEED_DIGEST_TIMEZONE`、`SMART_FEED_DIGEST_SEND_HOUR` 与 `SMART_FEED_DIGEST_MAX_LOOKBACK_HOURS` 管理，未配置时区时回退机器时区

### 12.2 访问控制

- MVP 阶段无多用户，单用户模式
- `bull-board` 仅允许内部管理入口访问，至少应加上基础鉴权或反向代理层访问限制
- 未来扩展: 添加用户认证与授权

### 12.3 内容安全

- 仅访问用户明确配置的来源
- 不绕过来源平台访问限制
- 不存储音视频原文件

---

## 13. 监控与可观测性

### 13.1 关键指标

| 指标类型 | 具体指标 | 告警阈值 |
|---------|---------|---------|
| **抓取** | RSS 抓取成功率 | < 90% |
| **处理** | 标准化失败率 | > 5% |
| **AI** | API 调用失败率 | > 2% |
| **AI** | 单日 Token 消耗 | > 100K |
| **Digest** | 生成成功率 | < 95% |
| **投递** | 邮件发送成功率 | < 98% |
| **缓存** | 分析缓存命中率 | < 80% |
| **队列** | 等待任务数 / 失败任务数 | 持续增长 15 分钟以上 |

### 13.2 日志记录

```typescript
// 结构化日志
logger.info("content.fetched", {
  content_id,
  source_id,
  duration_ms,
  status_code
});

logger.error("ai.analysis.failed", {
  content_id,
  model_strategy,
  error_message
});
```

### 13.3 审计追踪

通过 `pipeline_runs` 和 `step_runs` 表记录:
- 每个内容的处理历史
- 每个步骤的输入输出
- 失败原因与重试次数

### 13.4 队列可观测性

- 使用 bull-board 作为日常运维入口，查看 waiting / active / delayed / failed 队列状态
- 应用侧输出队列指标日志：`queue_name`、`job_id`、`attempts_made`、`latency_ms`
- 失败任务保留最近错误栈，并支持人工重试

---

## 14. 性能优化

### 14.1 数据库优化

```sql
-- 关键索引
CREATE INDEX idx_content_source ON content_items(source_id);
CREATE INDEX idx_content_status ON content_items(status);
CREATE UNIQUE INDEX uq_content_source_external_id
  ON content_items(source_id, external_id)
  WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX uq_content_source_normalized_url
  ON content_items(source_id, normalized_original_url)
  WHERE normalized_original_url IS NOT NULL;
CREATE UNIQUE INDEX uq_content_source_url_hash
  ON content_items(source_id, original_url_hash)
  WHERE original_url_hash IS NOT NULL;
CREATE INDEX idx_analysis_content ON analysis_records(content_id);
CREATE INDEX idx_analysis_score ON analysis_records(value_score);
CREATE INDEX idx_feedback_target ON feedback_signals(target_type, target_id);
```

### 14.2 任务并发

- RSS 抓取: 并发 10 个来源
- HTML 抓取: 并发 5 个页面
- AI 分析: 串行（避免 API 限流）

### 14.3 缓存策略

- 分析结果: 30 天
- Digest 渲染: 7 天
- RSS Feed: 1 小时

---

## 15. 验收映射

### 15.1 与产品需求对应

| 验收标准 | 架构实现 |
|---------|---------|
| **AC-1**: 批量导入统计 | `SourceImportRun` 记录 + API 返回 |
| **AC-2**: 数据分离 | `raw_body` + `cleaned_md` 分字段存储 |
| **AC-3**: 可追溯性 | `AnalysisRecord` 必填字段 + 校验函数 |
| **AC-4**: 屏蔽生效（后续迭代） | Digest Pipeline 读取 `feedback_signals` |
| **AC-5**: 风格偏好（后续迭代） | 用户配置 + AI Prompt 切换 |
| **AC-6**: 缓存复用 | 缓存键查询 + 结果复用 |

### 15.2 与用户故事对应

| Epic | 核心架构组件 |
|------|-------------|
| **Epic 1**: 来源管理 | Source API + Import Pipeline |
| **Epic 2**: 内容抓取 | Fetch Pipeline + Normalization |
| **Epic 3**: AI 分析 | AI 适配层 + Analysis Pipeline |
| **Epic 4**: Digest 编排 | Digest Pipeline + Delivery |
| **Epic 5**: 反馈优化 | Feedback API + Weight Adjustment |
| **Epic 6**: 系统约束 | 数据分离 + 追溯校验 + 成本控制 |

---

## 16. 实施路线图

### Phase 1: 基础设施 (2 天)
- 初始化 Next.js 项目
- 配置 Drizzle + PostgreSQL
- 设计数据库 Schema
- 配置 Redis + BullMQ + bull-board

### Phase 2: 来源管理 (2 天)
- 实现 Source API
- 实现 OPML 导入
- 实现 RSS 抓取 Pipeline

### Phase 3: 内容处理 (3 天)
- 实现 HTML 抓取
- 实现 Markdown 标准化
- 实现去重逻辑

### Phase 4: AI 分析 (3 天)
- 集成 Vercel AI SDK
- 实现轻量分析
- 实现重度摘要
- 实现缓存机制

### Phase 5: Digest 生成 (2 天)
- 实现 Digest 编排
- 实现邮件投递
- 实现可追溯性展示

### Phase 6: 反馈闭环 (2 天)
- 作为 MVP 之后的后续迭代，实现反馈 API
- 实现权重调整
- 实现过滤规则

### Phase 7: 优化与测试 (2 天)
- 性能优化
- 错误处理
- 集成测试

**总计**: 约 16 天（3 周）

---

## 17. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| RSS 源失效 | 内容缺失 | 记录失败日志，提供用户界面查看 |
| AI API 限流 | 处理延迟 | 实现指数退避重试 + 任务队列 |
| 成本超支 | 运营压力 | 轻模型前置 + 缓存 + 监控告警 |
| 邮件被拒 | 投递失败 | 使用可靠 SMTP 服务 + 重试机制 |
| 数据库性能 | 查询变慢 | 合理索引 + 定期清理历史数据 |

---

## 18. 未来扩展

### 18.1 多来源支持
- Podcast (转写稿)
- Newsletter (邮件转发)
- YouTube (字幕)
- 微信公众号 (RSS 代理)

### 18.2 高级功能
- 多用户支持
- 自定义 Digest 模板
- 主题订阅
- 移动端 App

### 18.3 AI 增强
- 多轮对话式摘要
- 个性化推荐算法
- 自动主题发现

---

**文档版本**: v0.2
**最后更新**: 2026-03-30
**维护者**: smart-feed 开发团队
