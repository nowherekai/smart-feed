# smart-feed - 认知模型文档

<cog>
本系统包括以下关键实体：
- source：信息源，是内容抓取与权重控制的入口
  - rss-source：RSS 订阅源，MVP 的核心来源
  - extensible-source：未来可扩展来源，如 Podcast、Newsletter、微信公众号、YouTube
- content-item：单条原始内容，是标准化、分析与编排的基础单位
- analysis-record：针对单条内容生成的结构化分析结果
- digest-report：按日或按周编排后的摘要报告
- feedback-signal：系统操作者对内容、主题、来源和摘要风格给出的反馈信号
- pipeline-run：针对内容处理或 digest 生成的一次完整流水线执行记录，属于运行治理与审计实体
- step-run：流水线中单个步骤的执行记录，属于运行治理与审计实体
</cog>

<source>
- 业务追踪编码：来源类型 + 来源规范化标识，例如 `rss:https://example.com/feed.xml`
- 内部标识：`id`（主键 UUID）；业务唯一性由 `type + identifier` 保证
- 常见分类：rss-source；podcast-source；newsletter-source；wechat-source；youtube-source；active；paused；blocked
</source>

<content-item>
- 业务追踪编码：来源追踪编码 + 来源侧原始内容 ID；若来源无稳定 ID，则使用原始链接或链接哈希
- 常见分类：article；video-transcript；podcast-transcript；newsletter；raw；normalized；deduplicated
- 关键字段：`id`（主键 UUID）；`source_id`（关联 source 的内部 UUID）；`external_id`（来源侧唯一 ID，如 RSS GUID，可缺失）；`original_url`（原文链接）；`normalized_original_url`（规范化后的原文链接，用于持久化去重）；`original_url_hash`（链接哈希，用于 URL 级去重回退）；`title`（原始标题）；`author`（原作者）；`raw_body`（抓取到的原始 HTML 或全文文本）；`cleaned_md`（清洗后的 Markdown）；`media_url`（封面图或外部媒体附件地址）；`published_at`（原文发布时间，可缺失）；`fetched_at`（系统抓取时间）；`effective_time`（规则层派生时间，取 `published_at ?? fetched_at`）
- 去重候选键顺序：同一 `source` 下优先使用 `external_id`，其次 `normalized_original_url`，最后 `original_url_hash`
</content-item>

<analysis-record>
- 唯一编码：`content_id + model_strategy + prompt_version`
- 常见分类：基础抽取；单篇摘要；深度分析；高价值内容；低价值内容；已缓存
</analysis-record>

<digest-report>
- 唯一编码：`period + date`，例如 `daily:2026-03-30`；其中 `date` 表示发送日本地日期标签
- 常见分类：日报；周报；邮件投递版；归档版
</digest-report>

<feedback-signal>
- 唯一编码：`target-type + target-id + timestamp`
- 常见分类：有用；没用；屏蔽来源；降低主题权重；提高来源权重；偏好短摘要；偏好深分析；偏好行动导向
</feedback-signal>

<pipeline-run>
- 唯一编码：`pipeline_name + target-id + started_at`
- 常见分类：source-import；content-processing；digest-compose；digest-deliver；pending；running；completed；failed
- 关键字段：`id`（主键 UUID）；`content_id`（可选，关联单条内容）；`digest_id`（可选，关联单次 digest）；`pipeline_name`（流水线名称）；`pipeline_version`（流水线版本）；`status`（执行状态）；`started_at`（开始时间）；`finished_at`（结束时间）
</pipeline-run>

<step-run>
- 唯一编码：`pipeline_run_id + step_name + started_at`
- 常见分类：fetch-feed；deduplicate；fetch-html；normalize；analyze-basic；analyze-heavy；compose-digest；deliver-email；pending；running；completed；failed
- 关键字段：`id`（主键 UUID）；`pipeline_run_id`（关联 pipeline-run）；`step_name`（步骤名称）；`input_ref`（输入引用）；`output_ref`（输出引用）；`status`（执行状态）；`error_message`（失败原因，可选）；`started_at`（开始时间）；`finished_at`（结束时间）
</step-run>

<rel>
- source-content-item：一对多（一个信息源会产生多条原始内容）
- content-item-analysis-record：一对多（同一内容可存在多轮分析、不同模型策略或版本结果）
- digest-report-content-item：多对多（一个 digest 汇总多条内容；同一内容也可复用于多个 digest）
- feedback-signal-source：多对一（针对来源的反馈会影响来源权重、启停或屏蔽状态）
- feedback-signal-content-item：多对一（针对单条内容的反馈会影响后续排序与摘要风格）
- content-item-pipeline-run：一对多（同一内容可经历多次流水线执行与重试）
- digest-report-pipeline-run：一对多（同一 digest 可对应多次生成或投递执行）
- pipeline-run-step-run：一对多（一次流水线执行由多个步骤执行记录构成）
</rel>
