---
type: arch
number: "020"
date: 2026-04-01
title: Sources 页面 OPML 导入入口与结果摘要
tags: [frontend, opml, source-import, sources]
related: ["arch/005", "arch/015", "arch/019"]
---

# arch/020 Sources 页面 OPML 导入入口与结果摘要

## 背景与动机

`runSourceImport({ mode: "opml" })` 与 OPML 解析器已经具备完整后端能力，但 `/sources` 页面仍只有单条 RSS URL 输入框。用户无法从前端上传现有订阅清单，也看不到批量导入后的新增、重复与失败统计，导致 US-1.2 只完成了后端半链路。

为了补齐来源接入入口，需要在不额外新增 REST API 的前提下，把前端页面收敛到现有导入服务语义上，并提供清晰但克制的本次导入结果反馈。

## 技术选型

| 方案 | 优点 | 代价 |
|------|------|------|
| 客户端读取 `File.text()`，再调用 Server Action 提交 OPML 文本 | 与当前 `sources` 页直连 action 的模式一致，不引入 multipart 或额外 API，返回结果最直接 | 大文件上传仍走同步 action，但对当前 MVP 的 OPML 清单规模足够 |
| 新增 multipart 上传 API 或 Route Handler | 更贴近传统文件上传语义 | 需要新增接口层、校验与序列化约定，超出当前页面接入范围 |

最终选择：**客户端读取 OPML 文本后调用新的 `importSourcesFromOpml` Server Action**，前端只负责文件选择、拖拽交互和结果展示。

## 架构设计

- `src/app/actions/source-actions.ts`
  - 新增 `importSourcesFromOpml(opmlText)`
  - 直接复用 `runSourceImport({ mode: "opml" })`
  - 仅返回前端需要的结构化摘要：总数、新增、已存在、失败数，以及失败条目明细
  - 成功时统一 `revalidatePath("/sources")` 与 `revalidatePath("/")`
- `src/app/sources/sources-client.tsx`
  - 用 Tab 拆分“单条 RSS”和“OPML 导入”入口
  - 新增原生文件选择与 drag-and-drop 上传区
  - 读取 `File.text()` 后触发 OPML 导入，并展示“本次导入结果”摘要卡片
  - 失败时只弹 toast，不清空已选文件，方便用户重试
- `src/app/sources/page.tsx`
  - 调整 skeleton，使首屏占位结构与双入口 Tabs 保持一致

## 相关文件

- `src/app/actions/source-actions.ts` — OPML 导入 Server Action 与结果契约
- `src/app/sources/sources-client.tsx` — 双入口表单、上传区与结果展示
- `src/app/sources/page.tsx` — `/sources` 页 skeleton
- `src/app/actions/source-actions.test.ts` — OPML action 测试
- `src/app/sources/sources-client.test.ts` — 前端反馈映射测试

## 相关变更记录

- `arch/005` — Task 1 来源接入 Pipeline
- `arch/015` — 前端组件边界瘦身与流式渲染整理
- `arch/019` — Sources 页面单条 RSS 导入校验与自动标题
