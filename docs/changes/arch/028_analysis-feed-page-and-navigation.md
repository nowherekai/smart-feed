---
type: arch
number: "028"
date: 2026-04-07
title: Analysis 页面与情报列表导航
tags: [frontend, analysis, navigation, pagination]
related: ["arch/010", "arch/014", "arch/015", "arch/026"]
---

# arch/028 Analysis 页面与情报列表导航

## 背景与动机

当前前端已经提供 Dashboard、Daily Digest、Original Feeds 和 Sources，但对于已经产出的 AI 分析记录，还缺少一个独立的浏览入口。用户只能在日报或原文详情里间接看到分析结果，无法直接从全局维度回看高价值分析内容。

为了补齐“分析结果浏览”链路，需要新增一个 Analysis 页面，支持按 `content_id` 去重展示分析记录，并提供基础分页与原文回跳能力。

## 技术选型

| 方案 | 优点 | 代价 |
|------|------|------|
| 在 App Router 页面通过 Server Action 直接读取去重后的 `analysis_records` | 延续现有页面的数据访问方式，首屏直接 SSR，避免额外接口层 | 需要自行处理去重 SQL、分页与 URL 参数规范化 |
| 新增 REST API 再由客户端拉取 | 接口边界更传统 | 与现有页面实现风格不一致，额外增加维护面 |

最终选择：**新增 `/analysis` 页面，并通过服务端查询直接读取去重后的 AI 分析记录**。

## 架构设计

- `src/app/analysis/query.ts`
  - 负责 Analysis 页面的参数归一化、分页、去重查询与日志输出
  - 使用 PostgreSQL `DISTINCT ON (content_id)` 优先保留 `status = 'full'` 的记录
- `src/app/actions/intelligence-actions.ts`
  - 暴露 `getAnalysisFeed()`，供页面服务端读取
- `src/app/analysis/page.tsx`
  - 作为新的 Server Component 页面入口
  - 服务端读取分页数据后交给客户端组件渲染
- `src/app/analysis/analysis-client.tsx`
  - 负责分析卡片列表与分页按钮交互
  - 通过 `router.replace` 同步页码查询参数
- 导航壳层
  - `Sidebar` 新增 `Analysis` 入口
  - `Header` 新增 `/analysis` 标题映射
- 规格文档
  - `spec/design/ui.spec.md` 补充 Analysis 页面、分页、排序和验收项

## 相关文件

- `src/app/analysis/query.ts` — Analysis 去重分页查询
- `src/app/analysis/page.tsx` — `/analysis` 页面入口
- `src/app/analysis/analysis-client.tsx` — 列表渲染与分页交互
- `src/app/analysis/types.ts` — Analysis 页面类型定义
- `src/app/actions/intelligence-actions.ts` — Analysis 数据读取 action
- `src/components/layout/sidebar.tsx` — 侧边栏导航入口
- `src/components/layout/header.tsx` — 页面标题映射
- `spec/design/ui.spec.md` — UI 规格补充

## 相关变更记录

- `arch/010` — Content Heavy Analysis 接入统一 Runtime 与可追溯落库
- `arch/014` — 前端 UI 架构与 Base UI 集成
- `arch/015` — 前端组件边界瘦身与流式渲染整理
- `arch/026` — AI 摘要契约重构与 Digest 回链优先
