# smart-feed 产品需求规格书

**项目名称**: smart-feed
**版本**: 0.1
**创建日期**: 2026-03-30
**更新时间**: 2026-03-30
**文档状态**: Ready for Implementation (Affordance-Driven / MAS)

---

## 1. 产品环境 (Product Environment)

### 1.1 产品定位与现状
* **正式命名**: `smart-feed`。
* **标语**: 将自定义订阅源转化为每日智能编排的个人情报摘要。
* **当前项目状态**: 当前仍处于原型阶段。MVP 将提供前端配置管理页面，并通过后台任务完成信息抓取、聚合、分析与投递。
* **核心环境定义**: 为知识工作者提供一个可控、可调优的信息处理空间。系统需完成信息获取、清洗标准化、AI 分析与 digest 编排，并将结果以日报形式投递。

### 1.2 主要行动者 (Primary Agents)

| Agent | 类型 | 主要目标 | 感知方式 (Signifiers) |
| :--- | :--- | :--- | :--- |
| **人类用户** | Human | 配置来源、消费情报、建立信任、持续调优输出 | 来源配置入口、邮件/报告、原文回链、摘要结构、反馈入口 |
| **AI 分析代理** | AI | 分类、抽取、摘要、价值判断，满足成本约束 | 标准化内容模型、来源元数据、分析缓存、反馈信号、约束规则 |
| **系统调度代理** | System | 在正确时间触发抓取、流水线分析、生成日报与投递 | 来源状态、抓取计划、内容状态、周期设置 |

---

## 2. 核心可供性目录 (Core Affordance Catalog)

### 2.1 主要可供性 (Primary)
* **P1 来源接入**: 允许用户显式添加单条 RSS 或批量导入 OPML 清单。
* **P2 内容转化**: 允许系统将原始 HTML 转化为统一的 Markdown 内容模型。
* **P3 智能分析**: 允许 AI 在分层处理前提下生成分类、关键词及单篇摘要。
* **P4 摘要编排与投递**: 允许系统按主题组织内容生成日报（Digest），并通过邮件投递。
* **P5 原文回链阅读**: 允许用户从摘要回到来源名称与原文链接。
* **P6 调优反馈**: 允许用户通过显式反馈（有用/没用/屏蔽）改变后续排序与风格。

### 2.2 次要与潜在可供性 (Secondary & Latent)
* **S1 成本控制策略**: 优先轻模型做筛选，仅对高价值内容做深度分析。
* **S2 摘要风格偏好**: 支持短摘要、深分析或行动导向三种模式的选择。
* **L1 多源扩展**: 架构预留 Podcast、Newsletter 等文本化来源的接入能力（非 MVP 交付）。

---

## 3. 最小可供性故事 (Minimum Affordance Stories)

### MAS-1: 从 RSS 到标准化内容池
* **主题**: 用户配置 RSS 订阅源，系统自动抓取并标准化存储。
* **核心序列**: 
    1. 用户通过 Web 页面添加单个 RSS，或导入 OPML 完成批量接入。
    2. 系统进行去重检查（提示已存在/已跳过/已新增）。
    3. 首次接入时，系统允许仅保存部分原始条目作为后续同步哨兵，不触发 AI 分析。
    4. 系统按计划抓取 `active` 状态源，仅将命中时间筛选窗口的内容转化为标准化 `content-item` 并送入后续流水线；时间判定以 `effective_time = published_at ?? fetched_at` 为准。
* **心理动机**: **自主性**（来源由用户决定）。

### MAS-2: 智能分析与结构化摘要
* **主题**: AI 自动分析内容价值，生成结构化摘要。
* **核心序列**:
    1. 系统执行轻量分析（分类、关键词、价值评分）。
    2. 对高价值内容触发摘要生成（整体摘要、段落摘要列表）。
    3. 摘要结果保留来源名称与原文链接，供用户继续深读。
* **心理动机**: **精通感**（理解 AI 的筛选逻辑并验证结论）。

### MAS-3: 日报编排与投递闭环
* **主题**: 系统每日自动编排 Digest 报告并主动投递。
* **核心序列**:
    1. 系统在每日本地 08:00 按本次 Digest 统计区间组织 `analysis-record`。
    2. 生成 Markdown 格式报告，并以发送日本地日期作为 `daily:YYYY-MM-DD` 与邮件标题日期标签后通过电子邮件投递。
    3. 用户在邮件中感知情报价值并决定是否深读。
* **心理动机**: **兴趣**（每日发现自己关心的来源中有价值的内容）。

### MAS-4: 反馈重塑个人情报流
* **主题**: 用户通过反馈信号校正系统后续的编排与分析行为（后续迭代能力，非当前 MVP 交付）。
* **核心序列**:
    1. 用户在 Digest 中对内容标记“有用/没用”或执行“屏蔽来源”。
    2. 系统持久化 `feedback-signal`。
    3. 下一轮编排时，系统根据反馈调整权重、过滤规则或摘要风格。
* **意义闭环**: 系统从单向输出转变为可被用户“驯化”的个人助手。

---

## 4. 环境约束与 Traceability 规范

### 4.1 核心约束
| 约束类型 | 详细要求 |
| :--- | :--- |
| **授权访问** | 仅允许采集用户明确配置的源；不得自动扩展抓取范围。 |
| **首次导入** | 首次导入仅允许保存少量原始条目作为同步哨兵；未命中时间筛选条件的内容不得进入标准化、AI 分析或 Digest 流水线。 |
| **数据分离** | 原始层（Raw HTML）与加工层（Markdown/Analysis）必须分开管理；加工层不得回写覆盖原始层。原始层内部，全文抓取可替代 feed 初始内容，feed 原始摘要通过 `rawExcerpt` 保留。 |
| **反馈响应** | 用户屏蔽或降权操作必须在下一轮输出中立即实质性生效。 |
| **隐私与格式** | 不处理音视频原文件，仅接受文本、字幕或转写稿。 |
| **成本控制** | 优先轻模型，仅对高价值内容（Value Score > 阈值）调用重模型摘要。 |

时间筛选窗口定义：单用户项目使用应用时区进行统一判定，默认由 `SMART_FEED_TIMEZONE=Asia/Shanghai` 指定；窗口大小默认由 `SMART_FEED_TIME_WINDOW_HOURS=72` 指定。规则为 `effective_time = published_at ?? fetched_at`，当 `effective_time >= now_in_app_timezone - TIME_WINDOW_HOURS` 时内容才可进入标准化、AI 分析与 Digest 流水线；若 `published_at` 与 `fetched_at` 都缺失，则不得进入后续流水线。首次导入允许为全部条目建立哨兵，但只有命中窗口的条目才能进入后续处理；迟到文章只要仍在窗口内，后续同步时仍可进入流水线。

Digest 日期与时区定义：数据库中的时间继续以 UTC 时间或 Unix timestamp 存储，业务上的日报日期、统计区间与投递时间统一按本地业务时区计算。Digest 业务时区优先使用 `SMART_FEED_DIGEST_TIMEZONE`，未配置时回退 `SMART_FEED_TIMEZONE`，再回退机器时区；默认发送时刻由 `SMART_FEED_DIGEST_SEND_HOUR=8` 定义。每次 Digest 的统计区间为 `window_start = max(last_successful_digest_at, now_local_8am - 48h)`、`window_end = now_local_8am`，其中最长回溯窗口由 `SMART_FEED_DIGEST_MAX_LOOKBACK_HOURS=48` 控制。`daily:YYYY-MM-DD`、`digest_date` 与邮件主题中的日期都表示发送日本地日期标签，而不是自然日全量统计区间；晚到内容只要其业务本地时间落在本次统计区间内，就进入本次 Digest。

### 4.2 Traceability 最小要求
所有面向用户的 AI 结论必须携带以下元数据，否则不得进入 Digest：
* `source_trace_id` 及来源名称。
* `original_url`。
* `content_trace_id`。
* **对应的证据片段 (Evidence Snippet)**。

### 4.3 非可供性 (Non-Affordances - 显式禁止)
1.  未经授权自动添加外部来源。
2.  直接存储或处理大型音视频原文件。
3.  输出无法回链原文的黑盒摘要。
4.  在 MVP 中提供复杂的 Web 后台工作台。

---

## 5. 领域对象与数据模型

### 5.1 核心实体接口 (TypeScript)
命名约定：`id` / `source_id` / `content_id` 表示内部 UUID 或外键；`identifier` 表示规范化 URL；`source_trace_id` / `content_trace_id` 仍可作为内部派生追踪字段，但不是 digest 准入前置条件。

```typescript
// 信息源
interface Source {
  id: string;
  type: "rss-source"; // MVP 仅限 RSS
  identifier: string; // 规范化 URL
  status: "active" | "paused" | "blocked";
  weight: number; // 默认 1.0
}

// 统一内容单元
interface ContentItem {
  id: string;
  source_id: string;
  external_id?: string; // 来源侧唯一 ID，缺失或不稳定时回退 URL 级去重
  normalized_original_url?: string; // 规范化后的原文链接
  original_url_hash?: string; // 原文链接哈希
  title: string;
  raw_body: string; // 原始 HTML
  cleaned_md: string; // 转换后的 Markdown
  original_url: string;
  published_at?: Date; // 原文发布时间，缺失时回退 fetched_at
  fetched_at: Date; // 系统抓取时间
}

// 分析结果 (必须版本化)
interface AnalysisRecord {
  id: string;
  content_id: string;
  model_strategy: string; // 如 "haiku-basic" 或 "sonnet-heavy"
  prompt_version: string; // 提示词版本
  category: string[];
  value_score: number;
  summary: {
    summary: string;
    paragraphSummaries: string[];
  };
  created_at: Date;
}

// 反馈信号
interface FeedbackSignal {
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
}
```

---

## 6. 感知通道与反馈层级

### 6.1 反馈机制时间层级
* **Immediate (< 100ms)**: 动作记录反馈。如：添加 RSS 后确认已接收请求。
* **Progressive (< 5s)**: 导入状态反馈。如：批量导入时显示“正在验证 5/10...”。
* **Completion**: 周期性反馈。如：日报已发送至邮箱，或下一轮日报已体现屏蔽效果。

### 6.2 跨模态感知
| 可供性 | 人类通道 (视觉/交互) | AI/系统通道 (语义/接口) |
| :--- | :--- | :--- |
| 添加来源 | Web 页面表单或 OPML 文件上传 | `POST /api/sources` |
| 阅读摘要 | 邮件主题、分组标题、卡片摘要 | `GET /api/digest` |
| 提交反馈 | 后续扩展的 Web / 报告内反馈入口 | `feedback-signal` 持久化记录（后续迭代） |

---

## 7. 验收标准 (Acceptance Criteria)

### 7.1 MAS-1 & MAS-2 验收 (核心流程)
* **AC-1**: 批量导入 10 个 RSS，其中 2 个重复，系统应提示成功 8 个，跳过 2 个；重复项计入 `skipped`，不计入 `failed`。
* **AC-2**: 只有 `effective_time = published_at ?? fetched_at` 命中时间筛选窗口并进入处理流水线的内容，才必须同时保存 `raw_body` 和 `cleaned_md`；首次导入建立的哨兵数据允许只保存最小原始字段。
* **AC-3**: 每一条生成的摘要下方必须显式包含 `original_url`，并展示结构化摘要内容。

### 7.2 MAS-3 验收 (当前 MVP)
* **AC-6**: 日报编排应优先复用已缓存的 `analysis-record`，不得重复消耗 API 额度。

### 7.3 MAS-4 验收 (后续反馈迭代)
* **AC-4**: 用户在 Digest A 中标记某来源为“屏蔽”，在 Digest B（下一周期）中该来源不得出现。
* **AC-5**: 用户声明“偏好短摘要”后，后续 `analysis-record` 的生成策略需切换至短文本模式。
