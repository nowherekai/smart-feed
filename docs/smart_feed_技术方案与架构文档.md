# smart-feed 技术方案与架构文档参考版

本文档不是最终版，只是一个调研的草稿，仅供参考。

## 1. 文档目标

- 用户通过 Web 页面添加单个 RSS 或导入 OPML 批量接入来源。
- 系统在后台异步完成抓取、去重、清洗标准化、AI 分析与 Digest 编排。
- 所有 AI 结论都可回链到来源、原文链接与证据片段。
- 用户反馈能够在下一轮 Digest 中实质性生效。
- 架构尽量平台无关，不依赖 Vercel，不强绑定单一第三方平台。

本文档聚焦 MVP，不覆盖复杂后台工作台、多来源采集、音视频处理与复杂权限体系。

## 2. 设计原则

### 2.1 核心原则

1. **后台异步优先**
   - 抓取、标准化、AI 分析、Digest 生成、邮件投递均在后台完成。
   - Web 层仅负责配置、查看状态、展示结果与接收反馈。

2. **原始数据与加工数据分离**
   - 原始 RSS / HTML 与清洗后的 Markdown、分析结果、Digest 结果分表存储。
   - 任一步骤失败或策略变更时，可重新处理，不破坏原始事实。

3. **可追溯优先于生成效果**
   - 所有进入 Digest 的 AI 结论必须附带来源、原文链接、内容标识与证据片段。
   - 不允许只保留最终摘要而丢失中间过程。

4. **规则优先，AI 补洞**
   - 去重、过滤、来源控制、基础分类优先用确定性规则实现。
   - AI 主要用于分类、关键词抽取、摘要和价值判断。

5. **轻模型前置，重模型后置**
   - 先用轻量模型做分类与价值评分。
   - 仅对高价值内容做深度摘要与更重的编排生成。

6. **模块边界清晰**
   - 前台、任务调度、后台 Worker、AI 适配层、数据层解耦。
   - 便于后续替换模型、队列、邮件服务或数据库托管方式。

---

## 3. MVP 范围

### 3.1 包含

- RSS 单个添加
- OPML 批量导入
- RSS 定时抓取
- HTML 原文保存
- Markdown 标准化
- 内容去重
- AI 分类、关键词、价值评分
- 高价值内容摘要
- 每日 Digest 生成
- 邮件投递
- 来源回链、原文链接、证据片段展示
- 用户反馈：有用 / 没用 / 屏蔽来源 / 偏好短摘要

### 3.2 不包含

- 自动发现外部来源
- Podcast / Newsletter / 音视频原文件处理
- 复杂管理后台
- 多租户权限体系
- 用户认证与授权

---

## 4. 推荐技术栈

### 4.1 应用层

- **Web 框架**: Next.js
- **样式**: Tailwind CSS
- **UI 组件**: shadcn/ui
- **包管理**: bun

### 4.2 数据层

- **数据库**: PostgreSQL
  - 本地开发：本地 PostgreSQL
  - 云端部署：Neon 或任意兼容 PostgreSQL 托管
- **ORM**: Drizzle ORM

### 4.3 后台任务

Redis + BullMQ

### 4.4 AI 层

- **模型抽象**: Vercel AI SDK
- **调用策略**:
  - 轻模型：分类、关键词、价值评分
  - 重模型：高价值摘要、Digest 局部编排

说明：使用 Vercel AI SDK 仅作为统一模型适配层，不依赖 Vercel 平台部署。

### 4.5 邮件投递

MVP不引入，只需要保存到数据库或本地（markdown格式）

---

## 5. 总体架构

```text
┌────────────────────┐
│     Next.js Web    │
│ 来源管理 / 状态查看 │
│ Digest 查看 / 反馈  │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│   Application API  │
│ 写配置 / 发命令     │
│ 查状态 / 读结果     │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐      ┌────────────────────┐
│    PostgreSQL      │◄────►│     Job Queue      │
│ 原始数据/标准化/分析│      │   pg-boss / Redis  │
│ Digest/反馈/审计    │      └────────────────────┘
└─────────┬──────────┘
          │
          ▼
┌────────────────────────────────────────────┐
│               pipeline(workers)            │
│ fetch -> normalize -> classify -> summarize│
│ -> compose digest -> deliver               │
└─────────┬──────────────────────────────────┘
          │
          ▼
┌────────────────────┐
│   External Systems │
│ RSS / SMTP / LLM   │
└────────────────────┘
```

### 5.1 角色划分

#### Web
负责：
- 添加来源
- 导入 OPML
- 查看导入结果与任务状态
- 查看 Digest 与溯源信息
- 提交反馈

不负责：
- 长时间抓取
- 大文本处理
- 模型调用长链路
- 定时任务执行

#### Scheduler
负责：
- 按周期触发 RSS 抓取
- 每日触发 Digest 编排
- 将任务写入队列

#### Worker
负责：
- 拉取任务
- 执行 Pipeline 各阶段
- 写回阶段结果与日志
- 失败重试

---

## 6. Pipeline / 工作流设计

### 6.1 核心阶段

```text
Source Ingestion
  -> Fetch RSS
  -> Parse Entries
  -> Deduplicate
  -> Fetch HTML
  -> Normalize to Markdown
  -> Lightweight Analysis
  -> Heavy Summary (if value_score > threshold)
  -> Digest Composition
  -> Email Delivery
  -> Feedback Adjustment
```

### 6.2 阶段定义

#### Stage 1: Source Intake
输入：用户提交的 RSS URL 或 OPML 文件
输出：`sources`

职责：
- 规范化 RSS URL
- 校验可访问性与格式合法性
- 去重检查
- 批量导入结果统计（新增 / 跳过 / 失败

#### Stage 2: Feed Fetch
输入：`active` 状态来源
输出：原始 feed entry 列表

职责：
- 按计划轮询 RSS
- 解析 entry 元数据
- 基于 `external_id` / `original_url` 去重
- 仅采集用户显式配置的来源


**首次导入哨兵同步规则**：

首次导入只落少量原始条目
不触发标准化、AI 分析、Digest pipeline
仅后续同步且命中时间窗口的内容才进入正常处理链路

#### Stage 3: Raw Content Capture
输入：feed entry
输出：`content_items.raw_body`

职责：
- 请求原文页面
- 保存原始 HTML
- 记录抓取时间、状态码、内容哈希

#### Stage 4: Normalization
输入：raw HTML
输出：`cleaned_md`

职责：
- 去除导航、广告、脚注噪音
- 保留标题、正文、列表、引用等主体结构
- 转换为统一 Markdown 模型
- 生成文本哈希用于近似去重

#### Stage 5: Lightweight Analysis
输入：Markdown 内容
输出：`analysis_record` 基础字段

职责：
- 分类
- 关键词抽取
- 价值评分
- 初步关注理由
- 判断是否进入重摘要链路

说明：
- 优先轻模型
- 输出必须为结构化 JSON
- 若解析失败，可降级为规则标签

#### Stage 6: Heavy Summary
触发条件：`value_score > threshold`
输出：完整摘要对象

职责：
- 生成一句话摘要
- 生成三点要点
- 生成“为什么值得关注”
- 抽取证据片段
- 校验 traceability 字段完整性

未满足追溯字段的结果不得进入 Digest。

#### Stage 7: Digest Composition
输入：当期有效 `analysis_record`
输出：Markdown Digest

职责：
- 按主题分组
- 排序高价值内容
- 过滤被屏蔽来源
- 根据反馈切换摘要风格
- 尽量复用缓存分析结果

#### Stage 8: Delivery
输入：Digest
输出：已发送邮件记录

职责：
- 渲染邮件正文
- 发送邮件
- 记录投递状态

#### Stage 9: Feedback Application
输入：用户反馈
输出：后续策略变化

职责：
- 写入 `feedback_signals`
- 更新来源权重 / 屏蔽标记 / 风格偏好
- 在下一轮 Digest 编排时立即生效

---

## 7. 数据模型设计

以下为 MVP 级别推荐实体。

### 7.1 sources

```ts
interface Source {
  id: string;
  type: "rss-source";
  identifier: string;
  title?: string;
  status: "active" | "paused" | "blocked";
  weight: number;
  created_at: Date;
  updated_at: Date;
}
```

### 7.2 source_import_runs

记录 OPML 或批量导入任务。

```ts
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
```

### 7.3 content_items

```ts
interface ContentItem {
  id: string;
  source_id: string;
  external_id: string;
  title: string;
  raw_body: string;
  cleaned_md: string | null;
  original_url: string;
  content_hash?: string;
  published_at: Date;
  fetched_at?: Date;
  status: "raw" | "normalized" | "analyzed" | "digested" | "failed";
}
```

### 7.4 analysis_records

```ts
interface AnalysisRecord {
  id: string;
  content_id: string;
  model_strategy: string;
  prompt_version: string;
  category: string[];
  keywords: string[];
  value_score: number;
  summary: {
    oneline: string;
    points: string[];
    reason: string;
  } | null;
  evidence_snippet: string | null;
  source_id: string;
  source_name: string;
  original_url: string;
  status: "basic" | "full" | "rejected";
  created_at: Date;
}
```

### 7.5 digests

```ts
interface Digest {
  id: string;
  digest_date: string;
  status: "draft" | "ready" | "sent" | "failed";
  markdown_body: string;
  created_at: Date;
  sent_at?: Date;
}
```

### 7.6 digest_items

```ts
interface DigestItem {
  id: string;
  digest_id: string;
  analysis_id: string;
  section_title: string;
  rank: number;
}
```

### 7.7 feedback_signals

```ts
interface FeedbackSignal {
  id: string;
  target_type: "content" | "source" | "topic";
  target_id: string;
  signal: "useful" | "useless" | "block" | "prefer_deep" | "prefer_short";
  created_at: Date;
}
```

### 7.8 pipeline_runs / step_runs

用于审计和回放。

```ts
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

---

## 8. Traceability 设计

所有用户可见 AI 输出都必须满足以下约束：

- `source_id`
- 来源名称
- `content_id`
- `original_url`
- `evidence_snippet`

### 8.1 进入 Digest 前的校验规则

```ts
function canEnterDigest(record: AnalysisRecord): boolean {
  return Boolean(
    record.source_id &&
    record.source_name &&
    record.content_id &&
    record.original_url &&
    record.evidence_snippet
  );
}
```

### 8.2 证据片段生成策略

MVP 建议：
- 从 `cleaned_md` 中按段落切分
- 摘要生成时要求模型返回引用片段
- 再用规则校验该片段是否真实存在于 `cleaned_md`
- 若不存在，则重新抽取或降级为规则片段

这样可降低“幻觉证据”风险。

---

## 9. AI 策略设计

### 9.1 分层模型策略

#### 轻量分析链路
用于：
- 分类
- 关键词
- 价值评分
- 是否值得重摘要

特点：
- 低成本
- 快速
- 可批处理

#### 重摘要链路
用于：
- 一句话摘要
- 三点要点
- 为什么值得关注
- 证据片段提炼

触发条件：
- `value_score > threshold`
- 来源未被屏蔽
- 内容未命中缓存

### 9.2 输出约束

所有模型输出要求：
- JSON Schema 校验
- 记录 `model_strategy`
- 记录 `prompt_version`
- 失败可回退

### 9.3 缓存策略

优先复用已有 `analysis_record`，满足 AC-6：

缓存键建议由以下组成：
- `content_id`
- 内容哈希
- `model_strategy`
- `prompt_version`
- 风格模式

如缓存命中，则直接复用，不重复调用模型。

---

## 10. 反馈驱动机制

### 10.1 反馈类型与处理

#### useful
- 提升内容所属来源或主题权重
- 同类内容在下次 Digest 排序更靠前

#### useless
- 降低来源或主题权重
- 降低相似内容进入重摘要的概率

#### block
- 将来源标记为 `blocked`
- 下一轮 Digest 完全过滤

#### prefer_short
- 将用户偏好切换到短摘要模板
- 后续优先返回更短 `summary`

#### prefer_deep
- 提升深分析模式优先级

### 10.2 生效时机

- 写反馈：立即落库
- 下一轮编排：必须读取最新反馈
- 已存在缓存分析结果可复用，但展示模板与排序必须按新反馈重组

---

## 11. API 设计（MVP）

### 11.1 来源管理

- `POST /api/sources`
  - 添加单个 RSS
- `POST /api/sources/import-opml`
  - 上传 OPML 并批量导入
- `GET /api/sources`
  - 查询来源列表
- `PATCH /api/sources/:id`
  - 更新状态或权重

### 11.2 Digest 与内容查询

- `GET /api/digest/latest`
  - 获取最新 Digest
- `GET /api/digest/:id`
  - 获取指定 Digest
- `GET /api/content/:id`
  - 获取内容与分析详情

### 11.3 反馈

- `POST /api/feedback`
  - 提交 useful / useless / block / prefer_short / prefer_deep

### 11.4 内部调度接口

仅内部使用：
- `POST /internal/jobs/fetch-source`
- `POST /internal/jobs/generate-digest`

生产上更推荐由 Scheduler 直接入队，而不是暴露公网接口。

---

## 12. Worker 任务设计

### 12.1 Job 类型

- `source.import`
- `source.fetch`
- `content.fetch-html`
- `content.normalize`
- `content.analyze.basic`
- `content.analyze.heavy`
- `digest.compose.daily`
- `digest.deliver.email`

### 12.2 Job 基本规则

- payload 仅传 ID，不传大文本
- 每个 Job 幂等
- 支持重试
- 失败写入 `step_runs`
- 同一 `content_id` 的重任务要防止并发重复执行

### 12.3 示例链路

```text
source.fetch
  -> content.fetch-html
  -> content.normalize
  -> content.analyze.basic
  -> content.analyze.heavy (conditional)

scheduler(daily)
  -> digest.compose.daily
  -> digest.deliver.email
```

---

## 13. 部署建议

### 13.1 开发环境

- Next.js Web
- Worker 进程
- Scheduler 进程
- PostgreSQL
- 可选 Mailhog / 本地 SMTP

### 13.2 生产环境

推荐 Docker Compose 起步，后续可迁移到 K8s。

服务拆分：
- `web`
- `worker`
- `scheduler`
- `postgres`

如果使用 Neon：
- `postgres` 可替换为云数据库
- 其余服务继续自托管

### 13.3 配置建议

环境变量建议分为：
- DB 配置
- Queue 配置
- LLM 配置
- Mail 配置
- Digest 调度配置
- Feature Flags

---

## 14. 可观测性与审计

### 14.1 最小监控项

- 来源抓取成功率
- 每阶段耗时
- 模型调用次数
- Digest 生成成功率
- 邮件投递成功率
- 被过滤 / 被屏蔽内容数量
- 缓存命中率

### 14.2 审计要求

需要可查询：
- 某条内容何时抓取
- 何时标准化
- 用了哪个模型策略
- 生成了什么摘要
- 证据片段来自哪里
- 为什么进入或未进入 Digest

---

## 15. 验收映射

### AC-1
批量导入时在 `source_import_runs` 记录新增、跳过、失败数，前端展示汇总。

### AC-2
`content_items` 同时保存 `raw_body` 与 `cleaned_md`。

### AC-3
`analysis_records` 中必须包含 `original_url` 与 `evidence_snippet`，否则不可进入 `digest_items`。

### AC-4
来源收到 `block` 反馈后，将 `sources.status` 更新为 `blocked`，下一轮 Digest 编排直接过滤。

### AC-5
偏好短摘要反馈写入用户偏好配置或反馈聚合结果，后续选择短摘要模板和策略。

### AC-6
Digest 编排先查找可复用 `analysis_record`，命中缓存则不重复调用 AI。

---

## 16. MVP 实施建议

### Phase 1
- 完成来源管理
- 完成 RSS 抓取与 HTML 保存
- 完成 Markdown 标准化
- 完成基础 Digest 页面

### Phase 2
- 接入轻量 AI 分析
- 接入高价值摘要
- 接入邮件投递
- 增加反馈链路

### Phase 3
- 优化缓存
- 增加权重与风格调优
- 增加审计与回放界面

---

## 17. 最终结论

smart-feed 的 MVP 最合适的形态不是“前端直接调用 AI 生成日报”，而是一个由后台 Pipeline 驱动的个人情报处理系统。

推荐架构为：

- **Next.js**：前端配置与结果展示
- **PostgreSQL + Drizzle**：事实存储与审计
- **pg-boss**：后台异步任务队列
- **Worker Runtime**：抓取、标准化、分析、编排、投递
- **Vercel AI SDK**：平台无关的模型适配层

该架构满足：
- 后台异步处理
- 原始数据与加工数据分离
- AI 结论可追溯
- 用户反馈可在下一轮输出中生效
- 不强依赖 Vercel 或单一云平台

后续可在不推翻主体架构的前提下，逐步扩展到 Podcast、Newsletter、更多模型提供方以及更复杂的工作流编排。


## 补充

需要对每一个内容（如rss的url），记录每一步操作的状态，比如url爬取不到，rss源不见了等。可以添加页面，记录失败操作，方便查看。
