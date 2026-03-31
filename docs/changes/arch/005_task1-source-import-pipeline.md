---
type: arch
number: "005"
date: 2026-03-31
title: Task 1 来源接入 Pipeline
tags: [backend, pipeline, rss, opml, bullmq]
related: ["arch/004"]
---

# arch/005 Task 1 来源接入 Pipeline

## 背景与动机

Task 0 已经提供了环境变量、时间窗口、URL 工具和 Pipeline Tracking，但 `source.import` 仍然是占位实现。要让系统真正具备“添加单个 RSS 源”和“批量导入 OPML 清单”的能力，必须补齐一条最小可运行的来源接入链路：

- 校验并规范化 RSS URL
- 探测 feed 是否可访问且确实是 RSS/Atom
- 将来源写入 `sources`
- 记录 `source_import_runs` 与 `source_import_run_items`
- 在创建成功后触发首次 `source.fetch`

这条链路是后续 Task 2 抓取与增量同步的前提，如果继续保留占位符，后续所有内容入库任务都会失去有效入口。

## 技术选型

| 方案 | 优点 | 代价 |
|------|------|------|
| 使用 `fast-xml-parser` 解析 OPML，并继续用原生 `fetch` + 轻量 XML 探测验证 RSS | 依赖轻、实现直接，适合当前 MVP 的单用户后台链路 | feed 校验仍是最小实现，不覆盖更复杂的协议细节 |
| 引入更重的 OPML/RSS 专用库统一处理导入与抓取 | 封装更多 | 对当前只实现 Task 1 的范围偏重，会把 Task 2 的问题提前耦合进来 |

最终选择：**OPML 使用 `fast-xml-parser`，RSS 可访问性使用原生 `fetch` 与最小 XML 元数据解析**，把来源导入和后续内容抓取职责明确拆开。

## 数据模型

本次实现沿用现有 schema，不新增表或迁移，直接落在以下实体上：

- `sources`
  - `type = "rss-source"`
  - `identifier` 保存规范化后的 feed URL
  - `status` 默认 `active`
  - `weight` 默认 `1`
  - `firstImportedAt` 在首次创建时写入
- `source_import_runs`
  - 记录单次导入的模式、总数、created/skipped/failed 汇总与运行状态
- `source_import_run_items`
  - 记录每条输入 URL 的结果、规范化 URL、对应 `source_id` 与错误信息

## 架构设计

本次变更把来源接入拆成四层，确保 `Task 1` 的边界清晰且可测试：

- `src/parsers/opml.ts`
  - 递归解析 OPML 1.0/2.0 的 `outline`
  - 只提取可导入的 `xmlUrl`
  - 保留重复条目，把重复判断留给服务层
- `src/services/source.ts`
  - 校验 URL 协议
  - 统一规范化 feed URL
  - 通过 `fetch` 拉取 feed，并从 RSS/Atom 元数据中提取标题与站点链接
  - 提供 `source` 查重与创建能力
- `src/services/source-import.ts`
  - 编排单条 RSS 导入与 OPML 批量导入
  - 按条写入 `source_import_run_items`
  - 汇总更新 `source_import_runs`
  - 对创建成功的 source 立即入队 `source.fetch`
- `src/pipeline/handlers/source-import.ts`
  - 将 `source.import` 从占位符替换为真实 handler
  - 其余 handler 继续保持 placeholder，不越界实现后续 Task

同时，原有单文件 `src/pipeline/handlers.ts` 被重构为目录结构，便于后续 Task 2-8 继续按 handler 拆分。

## 相关文件

- `src/parsers/opml.ts` — OPML 解析器
- `src/parsers/index.ts` — parser 导出入口
- `src/services/source.ts` — RSS 来源校验、查重、创建
- `src/services/source-import.ts` — 来源导入编排与首次抓取入队
- `src/pipeline/handlers/index.ts` — handler 映射
- `src/pipeline/handlers/source-import.ts` — `source.import` handler
- `src/services/source.test.ts` — RSS 来源服务测试
- `src/services/source-import.test.ts` — 导入编排测试
- `src/parsers/opml.test.ts` — OPML 解析测试
- `docs/plan/backend-implementation-plan.md` — Task 1 完成状态

## 相关变更记录

- `arch/004` — Task 0 后端基础工具层与 Pipeline Tracking
