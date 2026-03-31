# smart-feed 后台实施计划

**范围**: 仅后台代码（调度、Worker、Pipeline Handler、AI 层、服务层、工具层）
**不含**: Next.js 前端页面、API Routes、React 组件
**创建日期**: 2026-03-31
**文档状态**: 可以实施

---

## 0. 当前项目状态

### 已完成 (Sprint 0 骨架)

| 模块 | 状态 | 说明 |
|------|------|------|
| 数据库 Schema | ✅ | 13 张表，Drizzle ORM，迁移已生成 |
| DB 客户端 | ✅ | 懒初始化 Proxy，PostgreSQL + Drizzle |
| BullMQ 队列配置 | ✅ | 8 个 Job 类型，重试策略，并发度 |
| Redis 连接 | ✅ | 单例连接，环境变量配置 |
| Worker 入口 | ✅ | 启动/优雅关闭，事件监听 |
| Pipeline Handlers | ⬜ | **全部 8 个为占位符 (placeholder)** |

### 待实现 (本计划范围)

8 个 Pipeline Handler 的真实业务逻辑 + 支撑的服务层、AI 层、工具层、调度层。

### 任务清单

- [x] Task 0: 基础设施与工具层
- [x] Task 1: 来源接入 Pipeline
- [x] Task 2: RSS 抓取与内容入库
- [x] Task 3: HTML 抓取与 Markdown 标准化
- [ ] Task 4: AI 适配层
- [ ] Task 5: 轻量分析与深度摘要
- [ ] Task 6: Digest 编排
- [ ] Task 7: Digest 投递
- [ ] Task 8: 调度层

---

## 1. 子任务总览与依赖关系

```
Task 0: 基础设施与工具层
  │
  ├──► Task 1: 来源接入 Pipeline (source.import)
  │       │
  │       └──► Task 2: RSS 抓取与内容入库 (source.fetch)
  │               │
  │               └──► Task 3: HTML 抓取与 Markdown 标准化 (content.fetch-html + content.normalize)
  │                       │
  │                       └──► Task 4: AI 适配层 (Vercel AI SDK + Prompts)
  │                               │
  │                               └──► Task 5: 轻量分析与深度摘要 (content.analyze.basic + content.analyze.heavy)
  │                                       │
  │                                       └──► Task 6: Digest 编排 (digest.compose)
  │                                               │
  │                                               └──► Task 7: Digest 投递 (digest.deliver)
  │
  └──► Task 8: 调度层 (可与 Task 6/7 并行，但需等 Task 2 完成)
```

---

## 2. 子任务详细定义

### Task 0: 基础设施与工具层

**涉及实体**: pipeline_run, step_run (2 个)

**目标**: 搭建所有后续 Task 共用的基础模块

**交付文件**:

| 文件路径 | 说明 |
|---------|------|
| `src/config/env.ts` | 统一环境变量读取（SMART_FEED_* 系列） |
| `src/config/index.ts` | 导出聚合 |
| `src/utils/time.ts` | 时间窗口工具函数 |
| `src/utils/url.ts` | URL 规范化 + SHA-256 哈希 |
| `src/utils/logger.ts` | 结构化日志封装 |
| `src/utils/index.ts` | 导出聚合 |
| `src/services/pipeline-tracking.ts` | PipelineRun/StepRun CRUD 服务 |

**环境变量清单**:

```
SMART_FEED_TIMEZONE=Asia/Shanghai          # 应用时区
SMART_FEED_TIME_WINDOW_HOURS=72            # 滚动时间窗口(小时)
SMART_FEED_DIGEST_TIMEZONE=                # Digest 时区，未配置时回退 SMART_FEED_TIMEZONE
SMART_FEED_DIGEST_SEND_HOUR=8              # Digest 发送时刻(本地小时)
SMART_FEED_DIGEST_MAX_LOOKBACK_HOURS=48    # Digest 最大回溯窗口(小时)
SMART_FEED_VALUE_SCORE_THRESHOLD=6         # 触发深度分析的阈值
ANTHROPIC_API_KEY=                         # AI API Key
SMTP_HOST= / SMTP_PORT= / SMTP_USER= / SMTP_PASS=  # 邮件配置
SMTP_FROM= / SMTP_TO=                     # 发件人/收件人
```

**核心函数**:

```typescript
// time.ts
getEffectiveTime(publishedAt?: Date, fetchedAt?: Date): Date | null
isInTimeWindow(effectiveTime: Date, windowHours: number, timezone: string): boolean
getDigestWindow(lastSuccessDigestAt: Date | null, sendHour: number, timezone: string, maxLookbackHours: number): { windowStart: Date, windowEnd: Date }

// url.ts
normalizeUrl(url: string): string
hashUrl(url: string): string  // SHA-256 hex

// pipeline-tracking.ts
createPipelineRun(data: NewPipelineRun): Promise<PipelineRun>
updatePipelineRun(id: string, data: Partial<PipelineRun>): Promise<void>
createStepRun(data: NewStepRun): Promise<StepRun>
updateStepRun(id: string, data: Partial<StepRun>): Promise<void>
```

**验收标准**:
- [ ] 环境变量缺失时使用合理默认值
- [ ] `getEffectiveTime` 正确实现 `published_at ?? fetched_at`，两者都缺失时返回 null
- [ ] `isInTimeWindow` 基于配置时区正确判定
- [ ] `getDigestWindow` 正确计算 `window_start = max(last_successful_digest_at, now_local_8am - 48h)`
- [ ] URL 规范化对同一 URL 不同形式产生一致结果
- [ ] Pipeline/Step CRUD 可正确读写数据库
- [ ] TypeScript 类型检查通过

**新增依赖**: 无

---

### Task 1: 来源接入 Pipeline

**涉及实体**: source, source_import_run, source_import_run_item (3 个)

**目标**: 实现 `source.import` handler，支持单个 RSS 添加和 OPML 批量导入

**交付文件**:

| 文件路径 | 说明 |
|---------|------|
| `src/parsers/opml.ts` | OPML XML 解析器 |
| `src/parsers/index.ts` | 导出聚合 |
| `src/services/source.ts` | Source CRUD + RSS URL 验证 |
| `src/services/source-import.ts` | 导入流程编排（单个/批量） |
| `src/pipeline/handlers/source-import.ts` | source.import handler 实现 |
| `src/pipeline/handlers/index.ts` | handler 映射表（从原 handlers.ts 重构） |

**核心逻辑**:

1. **单个 RSS 导入流程**:
   - 验证 URL 格式
   - 尝试 fetch RSS feed 确认可访问性
   - 规范化 URL
   - 检查 `source` 表是否已存在 (type + identifier 唯一)
   - 存在 → 标记 skipped_duplicate
   - 不存在 → 创建 source (status=active, weight=1.0)
   - 记录 source_import_run + source_import_run_item
   - 触发首次 `source.fetch` job

2. **OPML 批量导入流程**:
   - 解析 OPML XML，提取所有 `<outline>` 中的 xmlUrl
   - 逐条执行单个 RSS 导入逻辑
   - 重复项计入 skipped，非法/不可访问计入 failed
   - 单条失败不影响其他条目
   - 汇总统计写入 source_import_run

**验收标准**:
- [ ] 单个有效 RSS URL 可成功创建 source
- [ ] 重复 URL 正确标记为 skipped_duplicate
- [ ] OPML 解析支持 1.0/2.0 格式
- [ ] 批量导入 10 个 RSS（含 2 个重复），结果为 created=8, skipped=2
- [ ] 导入完成后自动触发 source.fetch job
- [ ] source_import_run_items 保留逐条结果明细

**新增依赖**: `fast-xml-parser`

---

### Task 2: RSS 抓取与内容入库

**涉及实体**: source, content_item, content_item_raw (3 个)

**目标**: 实现 `source.fetch` handler，解析 RSS Feed 并将内容入库

**交付文件**:

| 文件路径 | 说明 |
|---------|------|
| `src/parsers/rss.ts` | RSS/Atom Feed 解析器 |
| `src/services/content.ts` | ContentItem CRUD + 三级去重 |
| `src/pipeline/handlers/source-fetch.ts` | source.fetch handler 实现 |

**核心逻辑**:

1. **RSS Feed 解析**:
   - 使用 rss-parser 解析 feed
   - 提取 title, author, link(original_url), pubDate(published_at), content(raw_body), guid(external_id)
   - 若 feed 仅提供摘要（description），同时提取为 raw_excerpt
   - 记录 fetched_at

2. **三级去重** (同一 source_id 下):
   - 第一级: `external_id`(RSS GUID) 存在时，查 `(source_id, external_id)`
   - 第二级: `normalized_original_url` 存在时，查 `(source_id, normalized_original_url)`
   - 第三级: `original_url_hash` 存在时，查 `(source_id, original_url_hash)`

3. **时间窗口过滤**:
   - 计算 `effective_time = published_at ?? fetched_at`
   - 两者都缺失 → 不进入后续 pipeline
   - `effective_time` 在窗口内 → 创建 content_item (status=raw) + content_item_raw (raw_body=feed 内容, raw_excerpt=feed 摘要) + 入队 content.fetch-html
   - `effective_time` 不在窗口内 → 仅记录哨兵数据（最小字段），不入队

4. **syncCursor 更新**:
   - 更新 source.syncCursor 中的 etag, lastModified, lastSeenExternalId 等
   - 更新 source.lastSuccessfulSyncAt

**验收标准**:
- [ ] 可解析标准 RSS 2.0 和 Atom 1.0 feed
- [ ] 三级去重正确工作，不产生重复 content_item
- [ ] 时间窗口过滤正确应用
- [ ] 首次同步为全部条目建哨兵，仅窗口内条目进入后续 pipeline
- [ ] 迟到文章在窗口内时，后续同步可进入 pipeline
- [ ] syncCursor 正确更新
- [ ] 新内容自动入队 content.fetch-html

**新增依赖**: `rss-parser`

---

### Task 3: HTML 抓取与 Markdown 标准化

**涉及实体**: content_item, content_item_raw (2 个)

**目标**: 实现 `content.fetch-html` 和 `content.normalize` handler

**交付文件**:

| 文件路径 | 说明 |
|---------|------|
| `src/services/html-fetcher.ts` | HTML 页面全文抓取 |
| `src/services/normalizer.ts` | HTML → Markdown 转换 |
| `src/pipeline/handlers/content-fetch-html.ts` | content.fetch-html handler |
| `src/pipeline/handlers/content-normalize.ts` | content.normalize handler |

**核心逻辑**:

1. **content.fetch-html**:
   - 根据 content_id 获取 original_url
   - 无论 RSS 是否看起来像全文，都优先抓取 original_url 对应的原始页面
   - 抓取成功时：
     - 将当前 raw_body（feed 原始内容）保存到 raw_excerpt（若 raw_excerpt 尚为空）
     - 用原始页面 HTML 更新 raw_body
   - 抓取失败时：
     - 保留现有 raw_body / raw_excerpt，使用 RSS 中已保存的原始内容继续后续标准化
   - 入队 content.normalize

2. **content.normalize**:
   - 读取 content_item_raw.raw_body
   - 使用 turndown 将 HTML 转换为 Markdown
   - 移除广告、导航、页脚等噪音元素
   - 限制单篇最大 50KB
   - 保存到 content_items.cleaned_md
   - 更新 content_items.status = "normalized"
   - 入队 content.analyze.basic

**验收标准**:
- [ ] 新文章发现后总是先尝试抓全文；抓取成功时 feed 原始内容先保存到 rawExcerpt，再用全文 HTML 更新 rawBody；抓取失败时回退使用 RSS 原始内容
- [ ] HTML → Markdown 转换保留正文、标题、链接、图片
- [ ] 移除广告和导航噪音
- [ ] cleaned_md 正确存入 content_items
- [ ] status 正确流转: raw → normalized
- [ ] 完成后自动入队 content.analyze.basic

**新增依赖**: `turndown`, `@types/turndown`

---

### Task 4: AI 适配层

**涉及实体**: analysis_record (1 个，仅 schema 定义层面)

**目标**: 搭建 Vercel AI SDK 客户端、Prompt 版本管理和输出 Schema

**交付文件**:

| 文件路径 | 说明 |
|---------|------|
| `src/ai/client.ts` | Vercel AI SDK 客户端初始化 |
| `src/ai/prompts.ts` | Prompt 版本注册表 |
| `src/ai/schemas.ts` | 输出结构 Zod Schema |
| `src/ai/index.ts` | 导出聚合 |

**核心设计**:

1. **客户端** (client.ts):
   - 初始化 Anthropic provider
   - 提供 `analyzeContent(content, strategy)` 统一入口
   - 支持 haiku (轻量分析) 和 sonnet (深度摘要) 两种模型

2. **Prompt 注册表** (prompts.ts):
   ```typescript
   const PROMPTS = {
     "basic-analysis-v1": { system, user, model: "haiku" },
     "heavy-summary-v1": { system, user, model: "sonnet" }
   }
   ```

3. **输出 Schema** (schemas.ts):
   ```typescript
   // 轻量分析输出
   BasicAnalysisSchema = z.object({
     categories: z.array(z.string()),
     keywords: z.array(z.string()),
     entities: z.array(z.string()),
     language: z.string(),
     sentiment: z.string(),
     value_score: z.number().min(0).max(10)
   })

   // 深度摘要输出
   HeavySummarySchema = z.object({
     oneline: z.string(),
     points: z.array(z.string()),
     reason: z.string(),
     evidence_snippet: z.string()
   })
   ```

**验收标准**:
- [ ] AI SDK 客户端可成功连接 Claude API
- [ ] 两个 Prompt 版本已注册且可正确加载
- [ ] Zod Schema 严格定义输出结构，AI 返回结果通过校验
- [ ] 模型策略字符串 ("haiku-basic" / "sonnet-summary") 与 prompt_version ("basic-analysis-v1" / "heavy-summary-v1") 正确对应

**新增依赖**: `ai`, `@ai-sdk/anthropic`, `zod`

---

### Task 5: 轻量分析与深度摘要

**涉及实体**: content_item, analysis_record (2 个)

**目标**: 实现 `content.analyze.basic` 和 `content.analyze.heavy` handler

**交付文件**:

| 文件路径 | 说明 |
|---------|------|
| `src/services/analysis.ts` | 分析服务（缓存检查、结果存储） |
| `src/services/traceability.ts` | 可追溯性校验 (canEnterDigest) |
| `src/pipeline/handlers/content-analyze-basic.ts` | content.analyze.basic handler |
| `src/pipeline/handlers/content-analyze-heavy.ts` | content.analyze.heavy handler |

**核心逻辑**:

1. **content.analyze.basic**:
   - 缓存检查: 查 `(content_id, "haiku-basic", "basic-analysis-v1")` 是否已存在
   - 命中缓存 → 跳过，直接检查是否需要入队 heavy
   - 未命中 → 调用 AI 轻量分析
   - 存储 analysis_record (status=basic)
   - 冗余写入 source_id, source_name, original_url, source_trace_id, content_trace_id
   - `value_score > THRESHOLD(6)` → 入队 content.analyze.heavy
   - `value_score <= THRESHOLD(6)` → 直接更新 content_items.status = "analyzed"（低价值内容到此完结，不进入深度摘要）

2. **content.analyze.heavy**:
   - 缓存检查: 查 `(content_id, "sonnet-summary", "heavy-summary-v1")` 是否已存在
   - 调用 AI 深度摘要
   - 生成 oneline, points, reason, evidence_snippet
   - 验证 evidence_snippet 是否存在于 cleaned_md（降级为前 200 字符）
   - 更新 analysis_record (status=full)
   - 执行 canEnterDigest 校验，不通过则标记 status=rejected
   - 更新 content_items.status = "analyzed"（高价值内容完结）

3. **canEnterDigest**:
   ```typescript
   function canEnterDigest(record): boolean {
     return Boolean(
       record.sourceTraceId &&
       record.sourceName &&
       record.contentTraceId &&
       record.originalUrl &&
       record.evidenceSnippet
     )
   }
   ```

**验收标准**:
- [ ] 轻量分析对每条内容生成 categories/keywords/entities/language/sentiment/value_score
- [ ] 缓存检查: 同一 content + strategy + prompt 不重复调用 AI
- [ ] `value_score > 6` 自动触发深度摘要
- [ ] 深度摘要生成 oneline/points/reason/evidence_snippet
- [ ] evidence_snippet 验证逻辑正确（存在于 cleaned_md 或降级）
- [ ] canEnterDigest 不通过时标记 rejected
- [ ] content status 流转: normalized → analyzed（无论高低价值，basic 或 heavy 完成后都必须推进到 analyzed）

**新增依赖**: 无（使用 Task 4 的 AI 层）

---

### Task 6: Digest 编排

**涉及实体**: digest_report, digest_item, analysis_record (3 个)

**目标**: 实现 `digest.compose` handler，生成日报

**交付文件**:

| 文件路径 | 说明 |
|---------|------|
| `src/services/digest.ts` | Digest 编排服务 |
| `src/services/digest-renderer.ts` | Markdown 报告生成器 |
| `src/pipeline/handlers/digest-compose.ts` | digest.compose handler |

**核心逻辑**:

1. **统计区间计算**:
   - 查询上一次成功的 digest (`status=sent`) 的 `sent_at`
   - `window_start = max(last_successful_digest_at, now_local_8am - DIGEST_MAX_LOOKBACK_HOURS)`
   - `window_end = now_local_8am`（当前触发时间）
   - `digest_date` = 发送日本地日期 (YYYY-MM-DD)

2. **收集分析记录**（基于内容业务时间，非分析完成时间）:
   - 从 `content_items` 出发，筛选 `effective_at` 在 `[window_start, window_end]` 内的内容
   - JOIN `analysis_records` where `status = 'full'`（有完整摘要）
   - canEnterDigest 通过（traceability 完整）
   - JOIN `sources` 排除 `status = 'blocked'` 的来源（后续反馈迭代预留）
   - 注意：晚到内容只要 `effective_at` 落在统计区间内即纳入，不依赖 `analysis_records.created_at`

3. **编排与分组**:
   - 按 `categories[0]`（主分类）分组
   - 组内按 `value_score` 降序
   - 每组生成 section_title

4. **Markdown 报告生成**:
   ```markdown
   # [smart-feed] 日报 2026-03-31

   ## 🏷️ 技术动态

   ### 文章标题
   > 一句话摘要

   **关键要点**:
   - 要点 1
   - 要点 2
   - 要点 3

   **关注理由**: ...

   📎 来源: 来源名称 | [原文链接](url)
   📝 证据: "原文片段..."

   ---
   ```

5. **持久化**:
   - 创建 digest_report (status=ready, markdown_body, digest_date, window_start, window_end)
   - 创建关联的 digest_items (analysis_record_id, section_title, rank)
   - 入队 digest.deliver

**验收标准**:
- [ ] 统计区间计算正确
- [ ] 基于 `content_items.effective_at`（而非 `analysis_records.created_at`）筛选统计区间内的内容
- [ ] 仅收集 status=full 且 traceability 完整的分析记录
- [ ] 排除 blocked 来源
- [ ] 按 category 分组，组内按 value_score 降序
- [ ] 生成的 Markdown 包含来源名、原文链接、证据片段
- [ ] digest_report 和 digest_items 正确持久化
- [ ] 完成后自动入队 digest.deliver
- [ ] 无内容时生成空报告或跳过

**新增依赖**: 无

---

### Task 7: Digest 投递

**涉及实体**: digest_report (1 个)

**目标**: 实现 `digest.deliver` handler，通过邮件发送日报

**交付文件**:

| 文件路径 | 说明 |
|---------|------|
| `src/services/email.ts` | SMTP 邮件发送服务 |
| `src/pipeline/handlers/digest-deliver.ts` | digest.deliver handler |

**核心逻辑**:

1. **邮件渲染**:
   - 读取 digest_report.markdown_body
   - 使用 marked 将 Markdown 转换为 HTML
   - 包裹基础 HTML 邮件模板（内联 CSS）

2. **邮件发送**:
   - 主题: `[smart-feed] 日报 YYYY-MM-DD`
   - From: SMTP_FROM
   - To: SMTP_TO
   - 正文: HTML 格式
   - 备选: 纯文本版 (markdown_body 原文)

3. **状态更新**:
   - 发送成功 → `digest_report.status = 'sent'`, `sent_at = now`
   - 发送失败 → `digest_report.status = 'failed'`, 记录错误日志
   - 失败不阻塞系统，支持重试

**验收标准**:
- [ ] Markdown → HTML 转换正确
- [ ] 邮件主题格式: `[smart-feed] 日报 YYYY-MM-DD`
- [ ] 通过 SMTP 成功发送邮件
- [ ] 发送成功更新 status=sent + sent_at
- [ ] 发送失败更新 status=failed + 记录日志
- [ ] 支持重试（幂等性: 已 sent 不重复发送）

**新增依赖**: `nodemailer`, `@types/nodemailer`, `marked`

---

### Task 8: 调度层

**涉及实体**: source (1 个)

**目标**: 配置 BullMQ repeatable jobs，实现定时抓取和日报生成

**交付文件**:

| 文件路径 | 说明 |
|---------|------|
| `src/scheduler/jobs.ts` | Repeatable job 定义与注册 |
| `src/scheduler/index.ts` | 调度器入口（启动/停止） |
| `src/workers/index.ts` | 修改：集成调度器启动 |

**核心逻辑**:

1. **RSS 定时抓取调度**:
   - 每小时执行一次
   - 查询所有 `status=active` 的 source
   - 为每个 source 入队一个 `source.fetch` job
   - Job 去重: 同一 source 的 fetch job 不重复入队

2. **Digest 定时生成调度**:
   - 每日本地 08:00 执行
   - 使用 BullMQ repeatable job + cron 表达式
   - 时区处理: 将本地 08:00 转换为 UTC cron
   - 入队 `digest.compose` job

3. **调度器生命周期**:
   - 随 Worker 进程启动时注册 repeatable jobs
   - Worker 优雅关闭时清理

**验收标准**:
- [ ] RSS 抓取每小时触发一次
- [ ] 每个 active source 都会收到 source.fetch job
- [ ] Digest 生成按本地 08:00 触发
- [ ] 调度器随 Worker 启动/停止
- [ ] 不会重复入队相同的 job

**新增依赖**: 无

---

## 3. Pipeline Handler 文件重构

当前 `src/pipeline/handlers.ts` 是单文件，随实施进度重构为目录结构：

```
src/pipeline/
├── handlers/
│   ├── index.ts                    # handler 映射表（JobName → handler 函数）
│   ├── source-import.ts            # Task 1
│   ├── source-fetch.ts             # Task 2
│   ├── content-fetch-html.ts       # Task 3
│   ├── content-normalize.ts        # Task 3
│   ├── content-analyze-basic.ts    # Task 5
│   ├── content-analyze-heavy.ts    # Task 5
│   ├── digest-compose.ts           # Task 6
│   └── digest-deliver.ts           # Task 7
└── index.ts                        # 导出聚合
```

**时机**: 在 Task 1 开始时执行重构，将占位符 handlers.ts 拆分为目录结构。

---

## 4. 新增依赖汇总

| 依赖 | 版本 | 用途 | 引入时机 |
|------|------|------|---------|
| `fast-xml-parser` | latest | OPML XML 解析 | Task 1 |
| `rss-parser` | latest | RSS/Atom feed 解析 | Task 2 |
| `turndown` | latest | HTML → Markdown | Task 3 |
| `@types/turndown` | latest | TypeScript 类型 | Task 3 |
| `ai` | latest | Vercel AI SDK 核心 | Task 4 |
| `@ai-sdk/anthropic` | latest | Claude 模型适配器 | Task 4 |
| `zod` | latest | Schema 验证 | Task 4 |
| `nodemailer` | latest | SMTP 邮件发送 | Task 7 |
| `@types/nodemailer` | latest | TypeScript 类型 | Task 7 |
| `marked` | latest | Markdown → HTML | Task 7 |

---

## 5. 新增目录结构

```
src/
├── config/                    # Task 0: 环境变量与应用配置
│   ├── env.ts
│   └── index.ts
├── utils/                     # Task 0: 工具函数
│   ├── time.ts
│   ├── url.ts
│   ├── logger.ts
│   └── index.ts
├── services/                  # Task 0-7: 业务服务层
│   ├── pipeline-tracking.ts   # Task 0
│   ├── source.ts              # Task 1
│   ├── source-import.ts       # Task 1
│   ├── content.ts             # Task 2
│   ├── html-fetcher.ts        # Task 3
│   ├── normalizer.ts          # Task 3
│   ├── analysis.ts            # Task 5
│   ├── traceability.ts        # Task 5
│   ├── digest.ts              # Task 6
│   ├── digest-renderer.ts     # Task 6
│   ├── email.ts               # Task 7
│   └── index.ts
├── parsers/                   # Task 1-2: 解析器
│   ├── opml.ts                # Task 1
│   ├── rss.ts                 # Task 2
│   └── index.ts
├── ai/                        # Task 4: AI 适配层
│   ├── client.ts
│   ├── prompts.ts
│   ├── schemas.ts
│   └── index.ts
├── scheduler/                 # Task 8: 调度层
│   ├── jobs.ts
│   └── index.ts
├── pipeline/                  # 重构: handler 目录化
│   ├── handlers/
│   │   ├── index.ts
│   │   ├── source-import.ts
│   │   ├── source-fetch.ts
│   │   ├── content-fetch-html.ts
│   │   ├── content-normalize.ts
│   │   ├── content-analyze-basic.ts
│   │   ├── content-analyze-heavy.ts
│   │   ├── digest-compose.ts
│   │   └── digest-deliver.ts
│   └── index.ts
├── db/                        # 已有
├── queue/                     # 已有
└── workers/                   # 已有 (Task 8 修改)
```

---

## 6. Job 链式触发关系

```
source.import ──► source.fetch (首次同步)
                      │
                      ▼
              content.fetch-html (每条新内容)
                      │
                      ▼
              content.normalize
                      │
                      ▼
              content.analyze.basic
                      │
                      ▼ (value_score > 6)
              content.analyze.heavy
                      │
                      ▼
              (等待 digest.compose 调度触发)

定时调度:
  每小时 ──► source.fetch (所有 active 源)
  每日 08:00 ──► digest.compose ──► digest.deliver
```

---

## 7. MAS/用户故事覆盖映射

| MAS | 用户故事 | 覆盖 Task |
|-----|---------|----------|
| MAS-1: RSS → 标准化内容池 | US-1.1, US-1.2, US-2.1, US-2.2 | Task 1, 2, 3 |
| MAS-2: 智能分析与可追溯摘要 | US-3.1, US-3.2, US-3.3 | Task 4, 5 |
| MAS-3: 日报编排与投递 | US-4.1, US-4.2, US-4.3 | Task 6, 7 |
| MAS-4: 反馈闭环 (后续迭代) | US-5.x | ❌ 本次不实现 |
| 系统约束 | US-6.1 数据分离 | Task 3 (raw/cleaned 分表) |
| 系统约束 | US-6.2 成本控制 | Task 4, 5 (分层分析) |
| 系统约束 | US-6.3 授权访问 | Task 1, 2 (仅用户配置的源) |

---

## 8. 验收标准覆盖

| AC | 说明 | 覆盖 Task |
|----|------|----------|
| AC-1 | 批量导入 10 个 RSS，重复 2 个，成功 8，跳过 2 | Task 1 |
| AC-2 | 命中时间窗口的内容保存 raw_body + cleaned_md | Task 2, 3 |
| AC-3 | 摘要携带 original_url + evidence_snippet | Task 5, 6 |
| AC-6 | Digest 复用已缓存 analysis-record | Task 5, 6 |

---

## 9. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| RSS 解析库对非标准 feed 兼容差 | 抓取失败 | try-catch 容错 + 错误日志 + 支持重试 |
| HTML 抓取被目标站点限制 | 内容缺失 | 合理 User-Agent + 超时 30s + 降级使用 RSS 内容 |
| AI API 限流/超时 | 分析延迟 | 指数退避重试 + 串行控制 + 缓存复用 |
| Bun 运行时兼容性 | 依赖报错 | 优先选择 Bun 友好的纯 JS 库 |
| 时区计算边界 | 内容遗漏/重复 | 充分测试 DST、跨日等边界情况 |
| SMTP 发送被拦截 | 投递失败 | 使用可靠 SMTP 服务 + 重试 + 日志 |

---

## 10. 实施节奏建议

| Task | 预估工作量 | 依赖 |
|------|-----------|------|
| Task 0: 基础设施 | 1 次会话 | 无 |
| Task 1: 来源接入 | 1 次会话 | Task 0 |
| Task 2: RSS 抓取 | 1 次会话 | Task 1 |
| Task 3: HTML 标准化 | 1 次会话 | Task 2 |
| Task 4: AI 适配层 | 1 次会话 | Task 0 |
| Task 5: 分析摘要 | 1 次会话 | Task 3, 4 |
| Task 6: Digest 编排 | 1 次会话 | Task 5 |
| Task 7: Digest 投递 | 1 次会话 | Task 6 |
| Task 8: 调度层 | 1 次会话 | Task 2 |

**总计**: 约 9 次实施会话

---

**文档版本**: v1.0
**最后更新**: 2026-03-31
