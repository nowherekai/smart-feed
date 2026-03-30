# smart-feed 用户故事集

**项目名称**: smart-feed
**版本**: 0.1
**创建日期**: 2026-03-30
**文档状态**: Ready for Implementation

---

## 故事分类框架

基于人类三大永恒最小故事模型：

- **Light (光明)**: 用户获得控制、理解和价值的故事
- **Dark (黑暗)**: 系统失控、信息过载、信任崩溃的反面故事
- **Grey (灰色)**: 权衡取舍、渐进优化、现实约束下的故事

---

## Epic 1: 信息源管理 (Source Management)

### US-1.1 添加单个 RSS 订阅源 [Light]

**作为** 知识工作者
**我想要** 通过 Web 页面添加单个 RSS 订阅源
**以便** 开始接收我关心的信息流

**验收标准**:
- 在 Web 表单中提交有效 RSS URL 后,系统返回"已添加"确认
- 系统生成 `source_trace_id` (格式: `rss:规范化URL`) 供展示与追踪使用
- 新源默认状态为 `active`,权重为 1.0
- 若 URL 已存在,提示"已存在,跳过"
- 首次添加时,系统允许仅保存部分来源侧原始条目作为后续同步哨兵,这些数据不进入标准化与 AI 处理 pipeline

**技术约束**:
- 必须验证 URL 格式和 RSS feed 可访问性
- 存储时保存内部 `id`（UUID）、`type: "rss-source"`、`identifier`、`status`、`weight`
- 首次导入的哨兵数据仅保存最小原始字段,如 `external_id` / `original_url` / `published_at` / 必要的原始摘要,用于后续同步判定
- 时间筛选窗口通过环境变量配置,单用户 MVP 默认使用 `SMART_FEED_TIME_WINDOW_HOURS=72` 与 `SMART_FEED_TIMEZONE=Asia/Shanghai`

**优先级**: P0 (MVP 核心)

---

### US-1.2 批量导入 OPML 订阅清单 [Light]

**作为** 从其他 RSS 阅读器迁移的用户
**我想要** 一次性导入我的 OPML 订阅清单
**以便** 快速完成初始配置

**验收标准**:
- 支持标准 OPML 1.0/2.0 格式
- 导入过程显示进度: "正在验证 5/10..."
- 完成后汇总: "成功 8 个,跳过 2 个(重复)"
- 重复源不覆盖已有配置
- 非法或不可访问的源按单条失败统计,不影响其他条目继续导入
- 每个新导入源首次只允许落库部分原始条目作为同步哨兵,不因批量导入而触发整批 AI 分析

**技术约束**:
- 解析 OPML XML 结构
- 批量去重检查
- 去重项计入 `skipped`,不计入 `failed`
- 非法源、解析失败或不可访问源计入 `failed`,不触发整批回滚
- 整个导入 run 必须保留逐条结果明细,便于后续审计与重试
- 首次导入阶段需要为每个 source 建立独立的同步哨兵标记或 cursor

**优先级**: P0 (MVP 核心)

---

### US-1.3 暂停或屏蔽信息源 [Grey]

**作为** 用户
**我想要** 暂停或永久屏蔽某个信息源
**以便** 控制信息流质量而不删除历史数据

**验收标准**:
- 支持将源状态改为 `paused` 或 `blocked`
- `paused` 源停止抓取但保留配置
- `blocked` 源不再出现在任何 digest 中
- 历史 `content-item` 和 `analysis-record` 保持不变

**技术约束**:
- 状态变更立即生效于下一轮抓取
- 反馈信号 `feedback-signal` 记录操作原因

**优先级**: P1

---

## Epic 2: 内容抓取与标准化 (Content Fetching & Normalization)

### US-2.1 自动抓取 RSS 内容 [Light]

**作为** 系统调度代理
**我需要** 按计划抓取所有 `active` 状态的 RSS 源
**以便** 持续获取最新内容

**验收标准**:
- 每个源按其更新频率抓取(默认每小时)
- 提取字段: `title`, `author`, `original_url`, `published_at`, `raw_body`
- 优先使用 `external_id`(RSS GUID)去重;若缺失或不稳定,回退到 `original_url` 或链接哈希
- 抓取失败不影响其他源,记录错误日志
- 仅命中时间筛选窗口的内容进入标准化、AI 分析与 digest pipeline；`effective_time = published_at ?? fetched_at`
- 首次导入阶段落库的哨兵原始数据不进入后续 pipeline,除非后续同步时满足时间筛选条件
- 迟到文章只要 `effective_time` 仍在时间窗口内,后续同步时仍可进入 pipeline

**技术约束**:
- 使用 RSS 解析库(如 `rss-parser`)
- 存储完整 HTML 到 `raw_body`
- `content-item` 唯一性遵循 `source_id + external_id` 或 `source_id + original_url/hash`
- 系统必须将上述去重顺序落实到持久化约束：优先 `(source_id, external_id)`，回退 `(source_id, normalized_original_url)` 与 `(source_id, original_url_hash)`
- 记录 `fetched_at` 时间戳
- source 侧需要记录首轮同步建立的哨兵信息,用于后续增量同步与时间窗口判定
- 时间窗口规则优先使用 `published_at`; 若缺失则回退 `fetched_at`; 两者都缺失的条目不得进入后续 pipeline
- 时间窗口按 `SMART_FEED_TIMEZONE` 的本地当前时间计算,默认滚动 72 小时

**优先级**: P0 (MVP 核心)

---

### US-2.2 HTML 转 Markdown 标准化 [Light]

**作为** 系统
**我需要** 将原始 HTML 转换为干净的 Markdown
**以便** 为 AI 分析提供统一格式

**验收标准**:
- 移除广告、导航、页脚等无关元素
- 保留正文、标题、链接、图片
- 输出存储到 `cleaned_md` 字段
- 原始 `raw_body` 保持不变(数据分离原则)

**技术约束**:
- 使用 HTML-to-Markdown 转换库
- 处理常见 RSS 格式(全文/摘要)
- 限制单篇内容长度(如 50KB)

**优先级**: P0 (MVP 核心)

---

## Epic 3: AI 智能分析 (AI Analysis)

### US-3.1 轻量级内容筛选 [Grey]

**作为** AI 分析代理
**我需要** 先用轻模型对所有内容做初步分类和价值评分
**以便** 控制成本并识别高价值内容

**验收标准**:
- 对每条 `content-item` 生成 `analysis-record`
- 提取: `category`(分类标签), `keywords`(1-5个), `entities`(公司/人名/产品/地点), `language`, `sentiment`, `value_score`(0-10)
- 使用轻模型(如 Claude Haiku)
- 处理时间 < 2秒/篇

**技术约束**:
- 模型策略标记为 `"haiku-basic"`
- 缓存结果避免重复分析
- 基础抽取结果需要版本化,便于后续模型升级重算
- `value_score > 6` 触发深度分析

**优先级**: P0 (MVP 核心)

---

### US-3.2 高价值内容深度摘要 [Light]

**作为** AI 分析代理
**我需要** 对高价值内容生成结构化摘要
**以便** 用户快速理解核心要点

**验收标准**:
- 生成三部分摘要:
  - `oneline`: 一句话总结
  - `points`: 3个关键要点
  - `reason`: 为什么值得关注
- 必须提取 `evidence_snippet`(原文证据片段)
- 关联 `content_trace_id`, `original_url` 和 `source_trace_id`

**技术约束**:
- 仅对 `value_score > 6` 的内容执行
- 使用 Sonnet 级别模型
- 模型策略标记为 `"sonnet-summary"`
- 证据片段长度 100-300 字符
- 缺少 `content_trace_id` / `original_url` / `evidence_snippet` 的摘要不得进入 digest

**优先级**: P0 (MVP 核心)

---

### US-3.3 分析结果缓存与版本化 [Grey]

**作为** 系统
**我需要** 缓存并版本化所有分析结果
**以便** 避免重复消耗 API 额度

**验收标准**:
- 同一 `content_id` + `model_strategy` + `prompt_version` 只分析一次
- 支持多版本共存(如模型升级后)
- 查询时优先使用缓存结果

**技术约束**:
- `analysis-record` 唯一键: `content_id + model_strategy + prompt_version`
- 添加 `created_at` 时间戳
- 过期策略: 保留最近 30 天

**优先级**: P1

---

## Epic 4: 摘要编排与投递 (Digest Generation & Delivery)

### US-4.1 按主题组织日报 [Light]

**作为** 系统
**我需要** 将当日分析结果按主题分组编排
**以便** 生成结构化的日报

**验收标准**:
- 收集本次 Digest 统计区间内所有 `analysis-record` (已完成摘要且 traceability 元数据完整的)
- 按 `category` 分组
- 每组内按 `value_score` 降序排列
- 生成 `digest-report` 实体,编码为 `daily:YYYY-MM-DD`,其中日期取发送日本地日期

**技术约束**:
- 默认每日按 Digest 业务时区的本地 08:00 触发
- Digest 业务时区优先使用 `SMART_FEED_DIGEST_TIMEZONE`,未配置时回退 `SMART_FEED_TIMEZONE`,再回退机器时区
- 本次统计区间为 `window_start = max(last_successful_digest_at, now_local_8am - 48h)`、`window_end = now_local_8am`
- `digest-report.digest_date` 使用发送日本地日期,不表示自然日全量统计区间
- 支持手动触发生成
- 输出 Markdown 格式

**优先级**: P0 (MVP 核心)

---

### US-4.2 邮件投递日报 [Light]

**作为** 用户
**我想要** 每天自动收到邮件形式的日报
**以便** 在邮箱中快速浏览情报

**验收标准**:
- 邮件主题: `[smart-feed] 日报 YYYY-MM-DD`,其中日期使用发送日本地日期
- 邮件正文包含:
  - 主题分组标题
  - 每条内容的摘要卡片
  - 原文链接(可点击)
  - 证据片段
- 支持配置收件邮箱

**技术约束**:
- 若晚到内容的业务本地时间仍落在本次统计区间内,则进入本次邮件投递对应的 Digest
- 使用 SMTP 或邮件服务 API
- HTML 邮件格式(从 Markdown 转换)
- 发送失败记录日志但不阻塞系统

**优先级**: P0 (MVP 核心)

---

### US-4.3 可追溯性验证 [Light]

**作为** 用户
**我想要** 从摘要直接跳转到原文
**以便** 验证 AI 结论的准确性

**验收标准**:
- 每条摘要必须显示:
  - 来源名称与 `source_trace_id`
  - `content_trace_id`(可短显示为 trace id 或可点击查看详情)
  - 原文链接(`original_url`,可点击)
  - 证据片段(`evidence_snippet`)
- 点击链接直达原文页面
- 若缺少 `content_trace_id` / `original_url` / `evidence_snippet`,该摘要不得进入 digest

**技术约束**:
- 链接有效性检查(可选)
- `digest-report` 与邮件正文都必须保留完整 traceability 元数据
- 证据片段高亮显示(未来优化)

**优先级**: P0 (MVP 核心)

---

## Epic 5: 反馈与优化 (Feedback & Optimization)

### US-5.1 标记内容有用/没用 [Light]

`MVP 范围说明`: 本故事保留为后续反馈闭环迭代，不属于当前 MVP 交付范围。

**作为** 用户
**我想要** 对日报中的内容标记"有用"或"没用"
**以便** 训练系统理解我的偏好

**验收标准**:
- 每条摘要下方提供 👍/👎 按钮或链接
- 点击后记录 `feedback-signal`
- 字段: `target_type: "content"`, `target_id: content_id`, `signal: "useful"/"useless"`
- 下一轮 digest 中,系统基于该信号调整同源或同主题内容的排序/过滤,不再沿用原权重
- 即时反馈: "已记录,将影响后续推荐"

**技术约束**:
- 反馈入口协议（包括邮件或 Web 回调方式）后续单独定义，本轮不规定邮件回调链接协议
- 持久化到 `feedback-signal` 表
- 记录 `timestamp`
- 记录反馈应用前后的权重或排序变化,便于审计

**优先级**: P1

---

### US-5.2 提权、降权或屏蔽信息源 [Dark → Grey]

`MVP 范围说明`: 本故事保留为后续反馈闭环迭代，不属于当前 MVP 交付范围。

**作为** 用户
**我想要** 快速提高、降低或屏蔽某个信息源
**以便** 让系统更贴近我真实的信息偏好

**验收标准**:
- 提供"提高此来源优先级"、"降低此来源权重"、"屏蔽此来源"操作
- `source.status` 或 `source.weight` 根据选择被更新
- 下一期日报中,提权源排序前移;降权源出现频率下降;屏蔽源不再出现
- 历史 `content-item` 和 `analysis-record` 保持不变

**技术约束**:
- 记录 `feedback-signal`: `target_type: "source"`, `signal: "upweight"/"downweight"/"block"`
- 记录 `weight_delta` 或目标权重
- 立即生效于下一轮编排
- 历史数据保留

**优先级**: P1

---

### US-5.3 调整主题偏好 [Grey]

`MVP 范围说明`: 本故事保留为后续反馈闭环迭代，不属于当前 MVP 交付范围。

**作为** 用户
**我想要** 降低或提高某类主题的出现频率
**以便** 让日报更贴近我真正关心的方向

**验收标准**:
- 支持"减少此主题"和"提高此主题关注度"操作
- 记录 `feedback-signal`: `target_type: "topic"`, `target_id: category/topic_id`, `signal: "downweight_topic"/"upweight_topic"`
- 下一轮 digest 基于主题权重调整分组排序、内容选择与投递频率
- 用户可在后续 digest 中观察到对应主题占比变化

**技术约束**:
- 主题权重存储为用户级配置或 `feedback-signal` 聚合结果
- digest 编排阶段读取主题权重与过滤规则
- 记录主题权重调整前后的变化,便于审计

**优先级**: P1

---

### US-5.4 调整摘要风格偏好 [Grey]

`MVP 范围说明`: 本故事保留为后续反馈闭环迭代，不属于当前 MVP 交付范围。

**作为** 用户
**我想要** 选择摘要风格(短/深/行动导向)
**以便** 匹配我的阅读习惯

**验收标准**:
- 支持三种模式:
  - `prefer_short`: 仅一句话摘要
  - `prefer_deep`: 完整三点要点
  - `prefer_action`: 强调可执行建议
- 设置后影响后续 `analysis-record` 生成策略
- 下一轮 digest 中可观察到摘要长度或表达方式的变化

**技术约束**:
- 存储为用户级配置或 `feedback-signal`
- AI 分析时读取偏好参数
- 默认为 `prefer_deep`

**优先级**: P2

---

## Epic 6: 系统约束与非功能需求 (System Constraints & NFRs)

### US-6.1 数据分离原则 [Grey]

**作为** 系统架构
**我需要** 严格分离原始数据与加工数据
**以便** 保证可追溯性和数据完整性

**验收标准**:
- `raw_body` 永不被覆盖或修改
- `cleaned_md` 和 `analysis-record` 独立存储
- 支持重新处理原始数据

**技术约束**:
- 数据库表分离或字段明确标记
- 删除操作仅标记状态,不物理删除

**优先级**: P0 (架构约束)

---

### US-6.2 成本控制策略 [Grey]

**作为** 系统运营者
**我需要** 控制 AI API 调用成本
**以便** 系统可持续运行

**验收标准**:
- 轻模型筛选 → 重模型摘要的两阶段处理
- 分析结果缓存复用
- 单日 API 调用量监控和告警

**技术约束**:
- 设置 `value_score` 阈值(默认 6)
- 记录每次 API 调用的 token 消耗
- 支持手动暂停自动分析

**优先级**: P0 (成本约束)

---

### US-6.3 授权访问边界 [Dark → Light]

**作为** 系统
**我必须** 仅访问用户明确授权的信息源
**以便** 遵守隐私和访问规范

**验收标准**:
- 不自动扩展抓取范围
- 不绕过来源平台的访问限制
- 不存储或处理音视频原文件

**技术约束**:
- 仅处理公开 RSS feed
- 音视频来源仅接受文本转写稿
- 记录所有数据来源

**优先级**: P0 (合规约束)

---

## 实施迭代计划 (Implementation Iterations)

### Sprint 0: 基础设施 (1-2天)
- 项目初始化(Bun + TypeScript)
- 数据库 schema 设计
- 基础 HTTP 服务与 Web 页面表单框架

**交付物**: 可运行的空项目骨架

---

### Sprint 1: MVP 核心流程 (5-7天)
**目标**: 完成从 RSS 到日报的完整链路

**包含用户故事**:
- US-1.1: 添加单个 RSS
- US-1.2: 批量导入 OPML
- US-2.1: 自动抓取 RSS
- US-2.2: HTML 转 Markdown
- US-3.1: 轻量级筛选
- US-3.2: 深度摘要
- US-4.1: 按主题组织日报
- US-4.2: 邮件投递
- US-4.3: 可追溯性验证

**验收标准**:
- 导入 10 个 RSS 源
- 自动生成并发送第一份日报
- 每条摘要携带来源、`content_trace_id`、原文链接和证据片段

---

### Sprint 2: 反馈闭环 (3-5天)
**目标**: 作为 MVP 之后的后续迭代，实现用户反馈与系统优化

**包含用户故事**:
- US-5.1: 标记有用/没用
- US-5.2: 提权/降权/屏蔽信息源
- US-5.3: 调整主题偏好
- US-1.3: 暂停/屏蔽源
- US-3.3: 分析缓存

**验收标准**:
- 用户可标记反馈且下一轮 digest 出现可观察变化
- 来源和主题权重调整在下一轮编排中立即生效
- 缓存命中率 > 80%

---

### Sprint 3: 优化与扩展 (按需)
**目标**: 性能优化和功能扩展

**包含用户故事**:
- US-5.4: 摘要风格偏好
- US-6.2: 成本监控
- 性能优化
- 错误处理增强

---

## 故事质量评估 (Story Quality Assessment)

### 按三大永恒故事分类统计

| 类型 | 数量 | 占比 | 说明 |
|------|------|------|------|
| **Light (光明)** | 9 | 50% | 用户获得控制和价值的正向故事 |
| **Grey (灰色)** | 7 | 39% | 权衡取舍和现实约束的故事 |
| **Dark (黑暗)** | 2 | 11% | 防御性故事,负责把失控风险转回可管理状态 |

**分析**: 故事集以 Light 为主导,体现产品价值;Grey 故事确保现实可行性;Dark 故事集中在反馈防御与授权边界,承担系统失控时的纠偏职责。

---

### 优先级分布

| 优先级 | 数量 | 关键故事 |
|--------|------|----------|
| **P0** | 12 | MVP 核心流程 + 架构约束 |
| **P1** | 5 | 反馈闭环 + 缓存优化 |
| **P2** | 1 | 摘要风格偏好 |

---

## 与产品需求规格 (pr.spec.md) 的映射

| MAS (最小可供性故事) | 对应用户故事 | 验收标准覆盖 |
|----------------------|-------------|-------------|
| **MAS-1**: RSS → 标准化内容池 | US-1.1, US-1.2, US-2.1, US-2.2 | AC-1, AC-2 |
| **MAS-2**: 智能分析与可追溯摘要 | US-3.1, US-3.2, US-3.3, US-4.3 | AC-3 |
| **MAS-3**: 日报编排与投递闭环 | US-4.1, US-4.2, US-3.3, US-6.2 | AC-6 |
| **MAS-4**: 反馈重塑个人情报流（后续迭代） | US-5.1, US-5.2, US-5.3, US-5.4, US-1.3 | AC-4, AC-5 |

### 核心可供性覆盖

| 可供性 | 对应用户故事 |
|--------|-------------|
| **P1 来源接入** | US-1.1, US-1.2, US-1.3 |
| **P2 内容转化** | US-2.1, US-2.2 |
| **P3 智能分析** | US-3.1, US-3.2, US-3.3 |
| **P4 摘要编排与投递** | US-4.1, US-4.2 |
| **P5 可追溯阅读** | US-4.3 |
| **P6 调优反馈（后续迭代）** | US-5.1, US-5.2, US-5.3, US-5.4 |
| **S1 成本控制策略** | US-3.1, US-3.3, US-6.2 |
| **S2 摘要风格偏好** | US-5.4 |

### 现实约束 (real.md) 覆盖

| 现实约束 | 对应用户故事 |
|----------|-------------|
| 授权访问边界 | US-6.3 |
| 不存储音视频文件 | US-6.3 |
| 原始/加工数据分离 | US-6.1 |
| AI 结论可追溯 | US-3.2, US-4.1, US-4.3 |
| 反馈作为控制信号 | US-5.1, US-5.2, US-5.3, US-5.4 |
| 分层处理控制成本 | US-3.1, US-3.3, US-6.2 |

---

## 附录: 认知模型实体与故事关联

| 实体 (cog.md) | 参与的用户故事 |
|---------------|---------------|
| **source** | US-1.1, US-1.2, US-1.3, US-5.2 |
| **content-item** | US-2.1, US-2.2, US-3.1, US-3.2, US-5.1 |
| **analysis-record** | US-3.1, US-3.2, US-3.3, US-4.1, US-5.4 |
| **digest-report** | US-4.1, US-4.2, US-4.3 |
| **feedback-signal** | US-5.1, US-5.2, US-5.3, US-5.4 |

---

**Last Updated**: 2026-03-30
**Document Version**: v0.1
