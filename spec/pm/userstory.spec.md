# smart-feed 用户故事集

**项目名称**: smart-feed  
**版本**: 0.2  
**创建日期**: 2026-03-30  
**更新时间**: 2026-04-07  
**文档状态**: Synced to Current Code

---

## 故事分类框架

基于人类三大永恒最小故事模型：

- **Light (光明)**: 用户从“没有能力”进入“可以完成任务”
- **Dark (黑暗)**: 系统遇到异常，用户需要被明确告知并可继续恢复
- **Grey (灰色)**: 用户在重复使用中建立稳定习惯

---

## Epic 1: 来源管理 (Source Management)

### US-1.1 添加单个 RSS 订阅源 [Light]

**作为** 知识工作者  
**我想要** 在 Sources 页面添加单个 RSS URL  
**以便** 立即把一个新来源接入系统

**验收标准**:
- 提交 URL 后系统会校验它是否为可访问的 RSS/Atom Feed
- 若来源不存在，则创建 `source` 并触发首次 `source.fetch`
- 若来源已存在，则返回 `skipped_duplicate`
- 新建来源默认 `status="active"`、`weight=1`

**技术约束**:
- 当前仅支持 `rss-source`
- 来源唯一键为 `(type, identifier)`
- 来源标题与站点链接从 Feed 元数据中自动提取

**优先级**: P0

---

### US-1.2 后台导入 OPML 订阅清单 [Grey]

**作为** 从其他阅读器迁移的用户  
**我想要** 上传 OPML 文件并在后台导入  
**以便** 不阻塞页面地批量接入来源

**验收标准**:
- 前端上传 OPML 后立即拿到一个导入 `run`
- 页面会持续轮询 `pending/running/completed/failed` 状态
- 页面展示总数、已处理、已新增、已存在、失败数量
- 单条失败不会阻断整个批次
- 成功创建的新来源会各自触发首次抓取

**技术约束**:
- OPML 解析支持嵌套 `outline`
- 批量导入有并发上限控制
- 导入明细写入 `source_import_run_items`

**优先级**: P0

---

### US-1.3 导出当前 RSS 来源为 OPML [Grey]

**作为** 用户  
**我想要** 导出当前来源列表为 OPML  
**以便** 备份或迁移订阅清单

**验收标准**:
- 点击导出按钮后返回一个 OPML 附件下载
- 导出内容包含当前全部 `rss-source`
- 导出文件名带应用时区日期

**技术约束**:
- 通过 `/sources/export` Route Handler 返回附件
- 导出结果按 `createdAt desc` 查询来源

**优先级**: P1

---

### US-1.4 暂停、恢复或删除来源 [Grey]

**作为** 用户  
**我想要** 管理已接入来源的运行状态  
**以便** 控制信息流规模并移除不再需要的来源

**验收标准**:
- 当前页面支持 `active` 与 `paused` 互切
- `paused` 来源不会进入调度扫描
- 用户可以删除没有被外键阻塞的来源
- 删除失败时页面返回错误提示

**技术约束**:
- 当前没有把来源设为 `blocked` 的前台入口
- 删除受数据库关联约束影响，存在内容时可能失败

**优先级**: P1

---

## Epic 2: 内容抓取与标准化 (Fetching & Normalization)

### US-2.1 调度器按小时扫描活跃来源 [Grey]

**作为** 系统调度代理  
**我需要** 每小时扫描需要同步的来源  
**以便** 把新内容送入后续流水线

**验收标准**:
- 调度器每小时触发 `scheduler.sources.sync`
- 只扫描 `status="active"` 且超过 1 小时未成功同步的来源
- 每个来源最多只生成一个去重后的 `source.fetch` 任务

**技术约束**:
- 调度器运行于 `source-dispatch-queue`
- 任务去重 ID 为 `source.fetch:{sourceId}`

**优先级**: P0

---

### US-2.2 抓取 Feed、去重并进行窗口门控 [Light]

**作为** 系统  
**我需要** 从 Feed 抓取内容并判断是否值得进入流水线  
**以便** 只处理窗口内的有效文章

**验收标准**:
- Feed 抓取支持 `ETag` / `Last-Modified`
- 内容去重顺序为 `external_id -> normalized_original_url -> original_url_hash`
- `effective_at = published_at ?? fetched_at`
- 窗口内内容写为 `raw`，窗口外内容写为 `sentinel`
- `sentinel` 内容不进入后续 HTML 抓取和 AI 分析

**技术约束**:
- 时间窗口默认 `72h`
- 304 响应也要更新来源同步元数据
- 来源同步游标写入 `sync_cursor`

**优先级**: P0

---

### US-2.3 全文抓取失败时允许降级继续 [Dark]

**作为** 系统  
**我需要** 在正文页抓取失败时尽量利用 RSS 原始正文继续处理  
**以便** 不因单步失败导致整篇内容完全失效

**验收标准**:
- 系统优先抓取 `original_url` 的 HTML
- 若抓取成功，则更新 `content_item_raws.raw_body`
- 若抓取失败但 RSS 已有原始内容，则以 fallback 方式继续进入标准化
- 若抓取失败且没有任何可用原始内容，则内容状态为 `failed`

**技术约束**:
- `content.fetch-html` 的结果允许 `completed_with_fallback`
- 抓取失败信息写入 `processing_error`

**优先级**: P0

---

### US-2.4 标准化原始内容为 Markdown [Light]

**作为** 系统  
**我需要** 把原始正文转换为干净的 Markdown  
**以便** 为 AI 提供稳定输入

**验收标准**:
- 标准化会移除常见噪音节点
- 自动补标题与原文链接
- Markdown 超长时会被截断并标记
- 成功后内容状态推进到 `normalized`

**技术约束**:
- 最大 Markdown 大小为 50KB
- 原始层与加工层分表存储

**优先级**: P0

---

## Epic 3: AI 分析与调试 (AI Analysis & Debug)

### US-3.1 基础分析生成结构化标签与评分 [Light]

**作为** AI 分析代理  
**我需要** 对标准化内容做轻量分析  
**以便** 给出分类、关键词和是否值得深读的判断

**验收标准**:
- 为单篇内容生成 `categories`、`keywords`、`entities`、`language`、`valueScore`
- 同一 `content_id + model_strategy + prompt_version` 优先复用缓存
- 当 `valueScore > SMART_FEED_VALUE_SCORE_THRESHOLD` 时，允许自动进入 heavy
- 分数不达标时，内容状态仍推进到 `analyzed`

**技术约束**:
- 当前支持 `dummy-basic` 与 `openrouter-basic`
- 没有 `cleaned_md` 或没有 AI Provider 时，该步骤失败并写入 `processing_error`

**优先级**: P0

---

### US-3.2 高价值内容生成深度摘要 [Light]

**作为** AI 分析代理  
**我需要** 对高价值内容生成深度摘要  
**以便** 用户可以快速理解核心信息

**验收标准**:
- 生成 `summary` 与 `paragraphSummaries`
- 仅在存在基础分析记录时允许执行 heavy
- heavy 结果写入新的 `analysis_record(status="full")`
- 成功后内容状态推进为 `analyzed`

**技术约束**:
- 当前支持 `dummy-heavy` 与 `openrouter-heavy`
- heavy 的 `categories` / `keywords` / `entities` 继承自最近的 basic 记录

**优先级**: P0

---

### US-3.3 在内容详情页手动重跑 AI [Grey]

**作为** 开发或操作者  
**我想要** 在单篇内容详情页手动重跑 AI  
**以便** 调试 Prompt、比较结果或覆盖旧记录

**验收标准**:
- 内容详情页提供 `Run Basic Analysis`、`Run Heavy Analysis`、`Run Full AI Flow`
- 支持 `new-record` 与 `overwrite` 两种运行模式
- 支持可选 `variantTag`
- heavy 重跑前必须已有至少一条 basic 记录

**技术约束**:
- 调试动作本质上是重新入队 BullMQ Job
- `new-record` 会生成带 rerunKey 的 Prompt 版本后缀

**优先级**: P1

---

## Epic 4: 摘要浏览与消费 (Consumption Surfaces)

### US-4.1 在 Dashboard 浏览高价值摘要卡片 [Light]

**作为** 用户  
**我想要** 在首页快速看到最重要的情报  
**以便** 打开应用后立刻掌握重点

**验收标准**:
- Dashboard 展示最多 10 条带摘要的分析结果
- 卡片按 `valueScore desc, createdAt desc` 排序
- 卡片展示分类、来源名、价值分和摘要首屏信息

**技术约束**:
- 仅展示 `summary != null` 的分析记录

**优先级**: P1

---

### US-4.2 在 Analysis 页面查看去重后的分析列表 [Grey]

**作为** 用户  
**我想要** 浏览完整的分析结果流  
**以便** 系统性地查看近期处理成果

**验收标准**:
- 页面按 `content_id` 去重
- 同一内容优先选择 `status="full"`，否则选最新记录
- 支持分页，每页 20 条
- 列表展示来源、分类、价值分、段落摘要与原文链接

**技术约束**:
- 页面查询通过 SQL `DISTINCT ON (content_id)` 实现

**优先级**: P1

---

### US-4.3 浏览原始内容并下钻到单篇详情 [Light]

**作为** 用户  
**我想要** 按时间和来源查看原始内容  
**以便** 从摘要回到处理前后的完整上下文

**验收标准**:
- 列表支持 `all / today / last-2-days / last-week`
- 列表支持按来源过滤
- 点击单篇内容进入详情页
- 详情页展示原始正文、清洗 Markdown、来源信息、时间信息和处理状态

**技术约束**:
- 列表基于 `effective_at` 排序
- 详情页读取 `content_items + content_item_raws + sources`

**优先级**: P0

---

### US-4.4 在内容详情页追踪分析、Digest 与流水线 [Grey]

**作为** 用户或开发者  
**我想要** 在单篇内容详情页看到处理历史  
**以便** 判断这篇内容为何得到当前结果

**验收标准**:
- 展示该内容的全部分析记录
- 展示关联的 `pipeline_runs` 与 `step_runs`
- 展示这篇内容进入过哪些 Digest、所在 section 和 rank

**技术约束**:
- Digest 关联来自 `digest_items -> digest_reports`

**优先级**: P1

---

### US-4.5 生成并投递后台日报 [Grey]

**作为** 系统  
**我需要** 定时生成后台日报并按条件投递  
**以便** 在无需人工介入的情况下完成每日输出

**验收标准**:
- 每日按 Digest 时区固定时刻触发 `digest.compose`
- 只收集窗口内 `status="full"` 且摘要可渲染的内容
- 结果写入 `digest_reports` 与 `digest_items`
- 若开启邮件功能，则继续执行 `digest.deliver`

**技术约束**:
- 发送失败时 `digest_reports.status="failed"`
- 邮件发送成功后写入 `sent_at`

**优先级**: P0

---

### US-4.6 在 Web Digest 页面查看摘要快照 [Grey]

**作为** 用户  
**我想要** 在 Web 页面浏览当前完整摘要集合  
**以便** 不依赖邮件也能快速阅读结果

**验收标准**:
- `/digest` 页面展示最多 50 条完整摘要记录
- 页面按 `valueScore desc, createdAt desc` 排序
- 页面为平铺时间线样式，不按持久化 Digest 分组读取

**技术约束**:
- 当前页面读取的是 `analysis_records(status="full")`
- 当前页面不是 `digest_reports` 的直接渲染视图

**优先级**: P1

---

### US-4.7 在 Stats 页面查看内容漏斗与趋势 [Grey]

**作为** 用户  
**我想要** 从统计页看到来源产出与处理漏斗  
**以便** 判断系统当前的处理规模和转化情况

**验收标准**:
- 支持按 `day / week / month / all` 切换范围
- 展示文章总数、已标准化、已分析、已入 Digest、高价值内容、来源总量
- 展示漏斗、Top 5 来源、趋势柱状图

**技术约束**:
- 统计以业务时区为准
- 高价值阈值在统计页当前固定按 `value_score >= 7` 计算

**优先级**: P1

---

## Epic 5: 运行观测 (Operations & Observability)

### US-5.1 在 worker 侧查看队列运行状态 [Grey]

**作为** 开发或运维操作者  
**我想要** 查看队列积压、失败任务和重试状态  
**以便** 判断后台系统是否健康运行

**验收标准**:
- worker 启动时同时启动 bull-board
- bull-board 挂载全部职能队列
- 服务默认监听 `127.0.0.1:3010/admin/queues`

**技术约束**:
- 当前只在 worker 进程暴露，不在 Next.js Web 中嵌入

**优先级**: P1

---

### US-5.2 保留结构化流水线审计记录 [Dark]

**作为** 开发者  
**我需要** 在任务失败或降级时能追踪每一步输入输出  
**以便** 快速定位问题

**验收标准**:
- 内容流水线与 Digest 流水线都写入 `pipeline_runs`
- 每个步骤写入 `step_runs`
- 失败时保留错误信息与完成时间
- 若有下一步任务，运行时自动透传 `pipelineRunId`

**技术约束**:
- 内容流水线名固定为 `content-processing`
- Digest 流水线名固定为 `digest-generation`

**优先级**: P0

