# Plan

本次要为 smart-feed 制定一份统计功能 MVP 需求计划，目标是先交付一组围绕内容规模、处理进度、内容价值和来源规模的核心统计，支持按业务时区查看自然日/自然周/自然月/全部范围。实现上优先复用现有 `content_items`、`analysis_records`、`sources` 的稳定字段与已有页面的时间口径，避免把内部运维审计和面向用户的内容统计混在第一版里。

## Scope
- In:
  - 提供统计时间范围切换：按自然日、自然周、自然月、全部。
  - 提供文章总数统计。
  - 提供已分析文章数统计。
  - 提供已入 Digest 文章数统计。
  - 提供高价值文章数与高价值占比统计，首版默认使用去重后的分析记录并按 `valueScore >= 7` 计算。
  - 提供 Active Source 数量 / 总 Source 数量统计，首版默认以 `sources.status = 'active'` 作为 active 口径。
  - 提供内容漏斗：总文章 -> 已标准化 -> 已分析 -> 已入 Digest。
  - 提供趋势图：新增文章数、完成分析数。
  - 提供来源产出 Top 5。
  - 为上述统计补齐查询层、页面展示、日志与测试。
- Out:
  - 来源质量 Top N。
  - 分类分布 / 兴趣雷达。
  - Ops Insights，包括 `pipeline_runs` / `step_runs` 成功率、失败率、处理延迟。
  - 面向运营的任务排障界面、告警、导出能力。
  - 自定义时间范围、来源维度下钻、多维组合筛选。
  - 来源榜单分页、展开查看全部。

## Product decisions
- 统计功能首版使用独立 `/stats` 页面，不混入现有 Dashboard。
- 时间范围采用业务时区下的自然日、自然周、自然月、全部，不使用滚动 24 小时 / 7 天 / 30 天口径。
- Active Source 首版固定定义为 `sources.status = 'active'`，后续如需改为“最近 N 天有成功同步”再单独扩展。
- 统计页首版采用 SSR 实时查库，不引入预聚合表或定时缓存；若后续数据量增长，再单独规划聚合缓存方案。

## Metric definitions
- 文章总数：按时间范围过滤后的 `content_items` 数量，时间字段统一使用 `effectiveAt`，并沿用业务时区口径。
- 已分析文章数：按时间范围过滤后的文章中，满足 `content_items.status in ('analyzed', 'digested')` 的数量。
- 已入 Digest 文章数：按时间范围过滤后的文章中，满足 `content_items.status = 'digested'` 的数量。首版不通过 `digest_items -> analysis_records -> content_items` 多表 join 计算，避免与漏斗口径不一致。
- 高价值文章数：按时间范围过滤后的已分析文章中，关联“每篇文章一条”的去重分析记录后，统计 `valueScore >= 7` 的文章数量。
- 高价值占比：高价值文章数 / 已分析文章数。实现阶段需要补一致性测试，确保进入已分析状态的文章能稳定关联至少一条分析记录。
- Active Source 数量：`sources.status = 'active'` 的来源数，不受文章时间范围影响；UI 需以“全局”标签或等价视觉方式提示该指标不随时间切换变化。
- 总 Source 数量：`sources` 总记录数，不受文章时间范围影响；UI 需以“全局”标签或等价视觉方式提示该指标不随时间切换变化。
- 内容漏斗：
  - 总文章：`content_items` 数量。
  - 已标准化：`content_items.status in ('normalized', 'analyzed', 'digested')` 的数量。
  - 已分析：`content_items.status in ('analyzed', 'digested')` 的数量。
  - 已入 Digest：`content_items.status = 'digested'` 的数量。
- 分析记录去重口径：所有依赖 `analysis_records` 的统计统一按 `content_id` 去重，优先级为 `status = 'full'` 优先于 `status = 'basic'`，同优先级下取 `createdAt` 最新一条，与现有 Analysis 页 `DISTINCT ON` 逻辑保持一致。
- 趋势图：
  - 新增文章数：按时间粒度聚合 `content_items.effectiveAt`。
  - 完成分析数：先按 `content_id` 去重分析记录，再按去重后记录的 `createdAt` 进行时间聚合，避免 basic/full 重复计数。
  - 分桶策略：自然日范围按小时分桶，自然周与自然月范围按天分桶，全部范围按月分桶，避免返回过密数据点。
- 来源产出 Top 5：按时间范围过滤后的 `content_items`，按 `sourceId` 分组后按文章数降序排序，默认仅展示前 5 名，不提供分页。

## Action items
- [ ] 固化实现边界，约定首版统计功能位于独立 `/stats` 页面，只覆盖内容统计，不混入运维监控。
- [ ] 设计统计查询契约，优先新增 `src/app/stats/query.ts` 或等价查询层，统一处理自然日/自然周/自然月/全部的参数归一化、业务时区窗口与分桶策略。
- [ ] 复用 `config/env.ts` 中的 `timeZone` 配置与现有时间处理方式，必要时补充共享时间工具，避免在统计查询里重复实现时区转换。
- [ ] 统一指标口径，使用 `content_items.status` 作为已分析/已入 Digest/漏斗阶段判定依据，并对依赖 `analysis_records` 的指标统一复用 `content_id` 去重规则。
- [ ] 评估统计查询所需索引，重点检查 `status + effectiveAt` 等组合过滤是否需要新增索引；如需要，使用仓库规范新增 forward-only migration。
- [ ] 实现概览卡片查询，覆盖文章总数、已分析文章数、已入 Digest 文章数、高价值文章数/占比、Active Source 数量、总 Source 数量，并区分“受时间范围影响”与“全局”指标。
- [ ] 实现内容漏斗查询，基于 `content_items.status` 产出稳定的阶段统计，并确保每层数量不大于上一层。
- [ ] 实现趋势查询，支持两条序列输出，并严格按“先去重分析记录、后时间聚合”的方式统计完成分析数。
- [ ] 实现来源产出 Top 5 查询，处理来源标题缺失时回退到 identifier，并定义仅 1 个 source 或空数据时的展示行为。
- [ ] 实现 `/stats` 页面展示，保持界面简洁，只展示必要卡片、图表和范围切换控件。
- [ ] 为统计查询与参数解析补充测试，至少覆盖时间范围边界、自然周/月起点、分析去重、高价值阈值、漏斗层级单调性、全部范围分桶策略、空数据集、单来源数据集和来源标题回退场景。
- [ ] 运行 `bun run check && bun run typecheck` 验证改动，并补一份 `docs/changes/` 变更记录说明最终实现范围与未纳入项。

## Risks and guardrails
- “全部”范围默认保留全量语义；若查询成本超出可接受范围，可在实现阶段增加日志观测，并在后续版本引入缓存或额外限制。
- 高价值占比依赖“已分析状态文章能稳定关联分析记录”这一前提，若实现阶段发现状态与分析记录存在偏差，应优先修正数据口径或补一致性兜底。

## Deferred items
- 来源质量 Top N：后续可在去重分析记录基础上增加最小样本数门槛，再统计平均 `valueScore`。
- 分类分布：后续可增加 Top Categories 列表或条形图，不建议首版直接做雷达图。
- Ops Insights：后续单独规划运维页或 admin 页，再接入 `pipeline_runs` / `step_runs` 的成功率、失败率与处理时延统计。
