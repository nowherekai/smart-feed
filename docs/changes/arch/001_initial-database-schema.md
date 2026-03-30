---
type: arch
number: "001"
date: 2026-03-30
title: smart-feed 首版数据库 Schema 设计
tags: [database, drizzle, postgresql, schema]
related: []
---

# arch/001 smart-feed 首版数据库 Schema 设计

## 背景与动机

项目已完成产品规格、用户故事与系统架构设计，但仓库内尚无正式数据库 Schema。
本次变更的目标是为 smart-feed 建立一套可直接落到 PostgreSQL + Drizzle ORM 的首版数据模型，
覆盖来源管理、内容采集、分析结果、Digest 编排、反馈信号以及运行审计。

## 技术选型

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| PostgreSQL + Drizzle ORM | 类型安全、适合 Bun/TypeScript、便于演进 migration | 需要补齐 ORM 与迁移工具依赖 | 采用 |
| 把所有内容字段塞进单表 | 建模简单、开发快 | 不满足原始数据与加工数据分离约束 | 不采用 |
| 原始内容与加工内容分表 | 满足约束，便于重跑清洗与分析 | 表数量增加 | 采用 |

## 数据模型

本次新增的核心表：

- `sources`：来源定义、状态、权重、同步游标
- `content_items`：内容主记录、去重字段、时间窗口字段
- `content_item_raws`：原始 HTML / 文本快照，与加工数据分离
- `analysis_records`：分类、关键词、实体、评分、摘要与证据片段
- `digest_reports`：日报/周报主表
- `digest_items`：Digest 与分析结果关联
- `feedback_signals`：用户反馈信号
- `source_import_runs` / `source_import_run_items`：单条导入 / OPML 导入审计
- `pipeline_runs` / `step_runs`：流水线运行审计

关键约束：

- `sources(type, identifier)` 唯一
- `content_items` 按 `(source_id, external_id)` -> `(source_id, normalized_original_url)` -> `(source_id, original_url_hash)` 三层去重
- `analysis_records(content_id, model_strategy, prompt_version)` 唯一
- `digest_reports(period, digest_date)` 唯一

## 架构设计

本次数据模型遵循以下原则：

- 原始数据与加工数据分离，避免覆盖原文
- 所有面向 Digest 的分析结果保留 traceability 所需字段
- 用 `effective_at` 支撑时间窗口过滤与索引
- 为来源导入与流水线执行保留审计表，降低后续扩展成本

## 相关文件

- `src/db/schema.ts` - Drizzle ORM Schema 定义

## 相关变更记录

- 暂无
