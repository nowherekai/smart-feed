---
type: arch
number: "029"
date: 2026-04-07
title: Stats MVP 页面与查询层
tags: [stats, dashboard, analytics, drizzle]
related: ["arch/021", "arch/028"]
---

# arch/029 Stats MVP 页面与查询层

## 背景与动机

当前 smart-feed 已具备来源接入、内容抓取、分析与 Digest 出稿链路，但还缺少一套面向用户的内容统计视图，无法快速回答“最近新增了多少文章”“分析完成了多少”“哪些来源最有产出”等基础问题。

本次实现按 MVP 范围新增独立 `/stats` 页面，聚焦内容规模、处理进度、内容价值和来源规模四类核心统计，不混入 `pipeline_runs`、`step_runs` 这类运维监控指标。

## 技术选型

| 方案 | 取舍 |
|------|------|
| 独立 `/stats` 页面 + SSR 实时查库 | 首版数据量可控，实现直接、口径清晰，且与现有页面架构一致。 |
| 单独查询层 `src/app/stats/query.ts` | 统一封装时间范围归一化、业务时区窗口、分析去重与分桶逻辑，避免在页面组件里散落 SQL 和时间计算。 |
| 基于 `content_items.status` 计算漏斗与 Digest 数 | 避免首版引入额外多表 join，保证漏斗和概览口径一致。 |
| 基于 `analysis_records` 去重后统计高价值与分析趋势 | 与 Analysis 页保持 `content_id` 维度的一致去重逻辑，避免 basic/full 双计数。 |
| 新增 `content_items(status, effective_at)` 组合索引 | 覆盖统计页最常见的“状态 + 时间窗口”过滤路径，减少实时聚合扫描成本。 |

## 数据模型

统计页没有新增业务表，继续复用现有表：

- `content_items`
  - `effective_at` 作为文章总数、漏斗和来源产出的统一时间字段
  - `status` 作为已标准化、已分析、已入 Digest 的统一状态口径
- `analysis_records`
  - 统一按 `content_id` 去重
  - 优先 `status = 'full'`，同优先级取 `created_at` 最新
  - `value_score >= 7` 视为高价值
- `sources`
  - `status = 'active'` 作为 Active Source 口径

本次新增数据库索引：

- `idx_content_items_status_effective_at`

## 架构设计

### 查询层

- `normalizeStatsParams` 统一解析 `range` 参数，默认落到 `week`
- `getStatsRangeWindow` 统一生成业务时区下的自然日、自然周、自然月、全部范围窗口
- `loadStatsPageData` 聚合输出概览卡片、漏斗、趋势和来源 Top 5
- 趋势查询按范围自动切换分桶：
  - 日：按小时
  - 周 / 月：按天
  - 全部：按月

### 时间处理

- 在 `src/utils/time.ts` 补充自然日 / 周 / 月起点与按业务时区平移小时、天、月的工具
- 查询层和测试统一复用这套工具，避免再次手写时区换算

### 页面展示

- 新增 `/stats` 页面与侧边栏入口
- 页面仅保留：
  - 概览卡片
  - 漏斗
  - 趋势图
  - 来源产出 Top 5
- Active Source / 总 Source 显式标记为“全局”，提示其不随时间范围变化

## 相关文件

- `src/app/stats/page.tsx` — Stats 页 SSR 入口
- `src/app/stats/stats-client.tsx` — 范围切换与统计页面展示
- `src/app/stats/query.ts` — 统计查询层、去重逻辑与趋势分桶
- `src/app/stats/query.test.ts` — 统计参数、去重、高价值、空数据与来源回退测试
- `src/utils/time.ts` — 业务时区自然周期工具
- `src/utils/time.test.ts` — 时间工具测试补充
- `src/db/schema.ts` — 统计过滤索引定义
- `drizzle/0001_mute_fat_cobra.sql` — forward-only 索引 migration

## 相关变更记录

- `arch/021` — Original Content 时间流页面与筛选导航
- `arch/028` — Analysis 页面与情报列表导航
