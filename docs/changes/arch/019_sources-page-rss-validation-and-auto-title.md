---
type: arch
number: "019"
date: 2026-04-01
title: Sources 页面单条 RSS 导入校验与自动标题
tags: [frontend, backend, rss, source-import]
related: ["arch/005", "arch/014", "arch/015"]
---

# arch/019 Sources 页面单条 RSS 导入校验与自动标题

## 背景与动机

`/sources` 页面原先的“Add New Source”表单直接要求用户手填标题，并把输入的 URL 与标题直接写入 `sources` 表。这条链路绕开了系统已有的来源导入能力，带来几个问题：

- 不会校验目标 URL 是否真的是 RSS/Atom feed
- 不会自动提取 feed title 与站点链接
- 不会执行来源去重
- 不会记录 `source_import_runs` / `source_import_run_items`
- 不会在创建成功后触发首次 `source.fetch`

这导致前端入口与后端既有的导入语义出现分叉。为了让单条来源添加具备一致的行为边界，需要把页面入口收敛到现有的 `source.import` 服务语义上。

## 技术选型

| 方案 | 优点 | 代价 |
|------|------|------|
| 在 `source-actions` 中直接复用 `runSourceImport({ mode: "single" })` | 复用现有 RSS 校验、去重、导入审计与首次抓取触发，前后端口径一致 | action 返回值需要从 `void` 改成结构化结果 |
| 在 `source-actions` 中单独重写“校验 + 建库”逻辑 | 改动局部更小 | 会复制导入逻辑，继续保留双轨行为，后续更难维护 |

最终选择：**页面入口直接复用 `runSourceImport({ mode: "single" })`**，前端只负责提交 URL 并展示结果。

## 架构设计

- `src/app/sources/sources-client.tsx`
  - 删除手填 title 输入框
  - 只保留 RSS URL 输入
  - 新增来源时不再做 optimistic add，改为等待服务端验证结果后刷新列表
  - 根据 `created / skipped_duplicate / failed` 显示不同提示
- `src/app/actions/source-actions.ts`
  - `addSource` 从直接写库改为调用 `runSourceImport`
  - 返回结构化结果，显式区分创建成功、重复跳过和校验失败
  - 仅在 `created / skipped_duplicate` 时触发页面 revalidate
- `src/services/source-import.ts`
  - 不改业务逻辑，由页面入口复用既有单条导入行为
- `src/app/sources/types.ts`
  - 继续沿用 `title ?? identifier` 的展示回退，不额外引入手工补 title 流程

## 相关文件

- `src/app/sources/sources-client.tsx` — Sources 页面表单与新增交互
- `src/app/actions/source-actions.ts` — 单条来源新增 action
- `src/app/actions/source-actions.test.ts` — action 结果分支测试
- `src/services/source-import.test.ts` — 自动提取 title 的导入测试

## 相关变更记录

- `arch/005` — Task 1 来源接入 Pipeline
- `arch/014` — 前端 UI 架构与 Base UI 集成
- `arch/015` — 前端组件边界瘦身与流式渲染整理
