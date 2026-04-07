---
type: arch
number: "031"
date: 2026-04-07
title: Ops Insights 管理页与运行聚合视图
tags: [ops, admin, pipeline, observability]
related: ["arch/017", "arch/029"]
---

# arch/031 Ops Insights 管理页与运行聚合视图

## 背景与动机

当前系统已经具备两类运维可观测能力：

- worker 侧 bull-board 队列入口，可查看队列堆积与任务执行情况
- 原文详情页中的 `pipeline_runs` / `step_runs` 明细，可追踪单条内容的处理过程

但缺少一个面向整体运行态势的聚合视图，无法直接回答“最近失败率是多少”“哪条 pipeline 或 step 更容易失败”“最近有哪些失败需要排查”这类运维问题。

因此本次新增独立的 `/admin/ops` 管理页，专门承接 `pipeline_runs` / `step_runs` 的聚合监控，不与面向内容消费的 `/stats` 混在一起。

## 技术选型

| 方案 | 取舍 |
|------|------|
| 独立 `/admin/ops` 页面 + SSR 实时查库 | 与 `/stats` 保持一致的查询层模式，首版无需额外聚合表，口径直接映射审计表。 |
| 基于 `started_at ?? created_at` 作为统计时间锚点 | 避免少量缺失 `started_at` 的记录完全丢出统计窗口。 |
| 成功率 / 失败率仅按终态记录计算 | `running` / `pending` 会影响总量，但不污染成功失败比例。 |
| 最近失败列表优先展示失败 step | step 失败更接近根因；仅当 pipeline 没有失败 step 时才回退展示 pipeline 失败。 |
| 首版不追加 migration | 现有索引足以支撑当前页面范围，待真实数据量验证后再决定是否补组合索引。 |

## 数据模型

本次不新增业务表，继续复用现有运行审计实体：

- `pipeline_runs`
  - `pipeline_name` 用于 pipeline 维度拆解
  - `status` 用于成功、失败、运行中、待执行统计
  - `started_at` / `finished_at` 用于时延计算
  - `content_id` / `digest_id` 用于失败项回链
- `step_runs`
  - `step_name` 用于 step 维度拆解
  - `status` / `error_message` / `started_at` / `finished_at` 用于失败与时延聚合

首版没有新增索引，也没有修改 runtime 写入逻辑。

## 架构设计

### 查询层

- 新增 `src/app/admin/ops/query.ts`
- 统一处理：
  - `range` 参数归一化
  - 业务时区下的自然日 / 周 / 月 / 全部窗口
  - pipeline 总览聚合
  - pipeline 维度拆解
  - `pipelineName + stepName` 维度拆解
  - 最近失败列表

### 页面与导航

- 新增 `src/app/admin/ops/page.tsx`
- 新增 `src/app/admin/ops/ops-client.tsx`
- 侧边栏加入 `Ops` 入口
- header 标题映射补充 `/admin/ops`
- 页面顶部提供 bull-board 外链，不做嵌入

### 指标口径

- 成功率：`completed / (completed + failed)`
- 失败率：`failed / (completed + failed)`
- 平均时延 / P95：仅统计同时具备 `started_at` 与 `finished_at` 的终态记录
- 最近失败：按 `finished_at ?? started_at ?? created_at` 倒序，并优先展示失败 step

## 相关文件

- `src/app/admin/ops/page.tsx` — Ops 页 SSR 入口
- `src/app/admin/ops/ops-client.tsx` — 范围切换与页面展示
- `src/app/admin/ops/query.ts` — 运行聚合查询与失败列表
- `src/app/admin/ops/query.test.ts` — 范围、比率、空数据与失败回退测试
- `src/components/layout/sidebar.tsx` — 侧边栏 Ops 导航入口
- `src/components/layout/header.tsx` — Header 标题映射补充

## 相关变更记录

- `arch/017` — Worker 独立端口 bull-board 队列监控
- `arch/029` — Stats MVP 页面与查询层
