---
type: arch
number: "032"
date: 2026-04-09
title: 新增 Digest Reports 网页归档
tags: [frontend, digest, nextjs]
related: []
---

# arch/032 新增 Digest Reports 网页归档

## 背景与动机
当前系统已经持久化生成真正的 `digest_reports`，但现有的 `/digest` 页面更多是一个实时或候选流的视窗，无法回溯某一天已发布的日报。这造成用户无法弥补长周期的阅读缺漏。本需求目标是在网页端新增历史归档日志（Archive）的直接浏览能力，并以 `markdownBody` 作为渲染基准以保持与邮件一致的阅读体验。

## 架构选型与决策
1. **数据真源**：历史详情页不重组分析数据，以保证绝对的邮件到 Web 一致性，直接渲染 `digest_reports.markdownBody`。
2. **时区处理**：为了保证不管服务器在哪个时区，页面展示的"日报 [Date]" 都不发生跨天日期的漂移错位，解析采用 `new Date(year, month - 1, day)` 从根本上切断由于 UTC 引发的漂移。
3. **渲染方案**：利用已引入的 `marked` 直接将 `markdownBody` 转换为 HTML 并在 `dangerouslySetInnerHTML` 环境下使用受限且静态信任的组件，为了保障样式添加了轻量级、无需引入重依赖组件的 `.prose-custom` CSS 层级样式。
4. **状态隔离过滤**：归档列表严格过滤只展示 `status in ('ready', 'sent')` 的合法日报。

## 核心实现
- **`actions`**: `src/app/actions/digest-archive-actions.ts` 提供 Server Actions 给 RSC（支持前后翻页查找和历史列表排列查询）。
- **`pages`**: 
  - `src/app/digests/page.tsx`: 日报历史按倒叙查看的列表页。
  - `src/app/digests/[date]/page.tsx`: 具名日期的日报详细报告。
- **`P1 增强`**: `src/app/original-content/[contentId]/page.tsx` 中 `Digest Relations` 直接桥接到归档列表的详情对应链接中。

## 相关文件
- `src/app/actions/digest-archive-actions.ts` — Server action
- `src/app/digests/page.tsx` — 归档列表
- `src/app/digests/[date]/page.tsx` — 归档详情页
- `src/app/globals.css` — `.prose-custom` Markdown样式

## 后续 TODO
- [ ] 考虑后续针对周刊（Weekly Digest）兼容与增强支持。
