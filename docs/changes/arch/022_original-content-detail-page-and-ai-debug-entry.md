---
type: arch
number: "022"
date: 2026-04-02
title: Original Content 详情页与 AI 调试入口
tags: [frontend, content, debug, ai]
related: ["arch/009", "arch/010", "arch/015", "arch/021"]
---

# arch/022 Original Content 详情页与 AI 调试入口

## 背景与动机

`/original-content` 列表页已经能按时间流浏览原始抓取内容，但排查单条内容是否完成标准化、分析、进入 digest，仍然要直接查数据库或手动拼多表 SQL。

为了降低调试门槛，需要补齐一个面向内部调试的单条详情页，并且提供手动触发 AI 分析链路的入口，让开发时可以从具体内容直接观察和驱动整条处理链路。

## 技术选型

| 方案 | 优点 | 代价 |
|------|------|------|
| 以 Server Component 为主体，在页面服务端直接查询详情数据，仅把按钮交互放到 Client Component | 保持长文本留在服务端渲染路径，避免 `rawBody` / `rawExcerpt` / `cleanedMd` 作为大 client props 传输 | 需要把读模型和交互边界拆得更清楚 |
| 整个详情页做成 Client Component，通过 action 或 API 二次取数 | 客户端交互实现直观 | 大文本序列化成本高，详情页首屏与调试信息更容易变重 |
| 手动触发调试任务时直接创建 `pipeline_runs` | 调用端可显式感知 run 记录 | 与现有 runtime 自动建 run 机制重复，职责边界变乱 |

最终选择：

- 新增 `/original-content/[contentId]`，页面主体保持 Server Component
- 读操作统一收口到 `src/app/actions/original-content-actions.ts`
- 写操作和调试入队统一收口到 `src/app/actions/content-debug-actions.ts`
- 手动触发 AI flow 时只负责入队，由 `pipeline-runtime` 在执行时自动创建新的 `pipeline_run`

## 架构设计

- `src/app/original-content/[contentId]/query.ts`
  - 先读取 `content_items + sources + content_item_raws` 基础信息
  - 再并行读取 `analysis_records`、`pipeline_runs + step_runs`、`digest_items + digest_reports`
  - 在 query 层完成 pipeline run 与 step run 的分组，避免页面组件处理数据库形状
- `src/app/actions/original-content-actions.ts`
  - 新增 `getContentDetail(contentId)`，延续 original-content 读模型统一出口
- `src/app/actions/content-debug-actions.ts`
  - 新增 `enqueueBasicAnalysis`、`enqueueHeavyAnalysis`、`enqueueFullAiFlow`
  - 在 action 内做最小前置条件校验，并返回清晰的调试反馈文案
- `src/app/original-content/[contentId]/page.tsx`
  - 作为详情页入口，负责整体布局与服务端渲染的数据区块
  - 长文本区块通过独立的 server-rendered panel 组件展示
- `src/app/original-content/[contentId]/content-detail-actions.tsx`
  - 仅承接按钮点击、pending 状态、toast 与 `router.refresh()`
- `src/components/features/original-content-card.tsx`
  - 把 `CardHeader + CardContent` 改为详情页链接区域
  - 保持 `Read Original` 外链为 sibling，避免嵌套链接与 `stopPropagation`

## 相关文件

- `src/app/actions/original-content-actions.ts` — 新增详情读 action
- `src/app/actions/content-debug-actions.ts` — 调试写 action / AI 入队入口
- `src/app/original-content/[contentId]/page.tsx` — 详情页入口
- `src/app/original-content/[contentId]/query.ts` — 详情页查询与分组
- `src/app/original-content/[contentId]/content-detail-actions.tsx` — 刷新与调试按钮交互
- `src/app/original-content/[contentId]/raw-content-panel.tsx` — Raw Content 长文本区块
- `src/app/original-content/[contentId]/cleaned-markdown-panel.tsx` — Cleaned Markdown 长文本区块
- `src/components/features/original-content-card.tsx` — 列表页跳转结构调整

## 相关变更记录

- `arch/009` — Content Pipeline 通用失败阻断与基础分析最小闭环
- `arch/010` — Content Heavy Analysis 接入统一 Runtime 与可追溯落库
- `arch/015` — 前端组件边界瘦身与流式渲染整理
- `arch/021` — Original Content 时间流页面与筛选导航
