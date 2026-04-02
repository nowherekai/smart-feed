---
type: arch
number: "021"
date: 2026-04-02
title: Original Content 时间流页面与筛选导航
tags: [frontend, content, sources, filters]
related: ["arch/006", "arch/014", "arch/015"]
---

# arch/021 Original Content 时间流页面与筛选导航

## 背景与动机

当前前端只有 Dashboard、Digest 与 Sources 三个主视图。原始抓取内容虽然已经落在 `content_items` 与 `content_item_raws`，但用户无法直接查看“AI 处理前”的全局时间流，也无法按来源或时间窗口快速回看最近同步到的原文。

为了补齐浏览链路，需要新增一个独立页面，直接展示原始抓取结果，并保证筛选状态可以通过 URL 保留和分享。

## 技术选型

| 方案 | 优点 | 代价 |
|------|------|------|
| 直接在 App Router 页面通过 Server Action 读取数据库，并把筛选状态写入 URL 查询参数 | 与现有 `sources` / `digest` 页面风格一致，不新增 REST API，SSR 首屏完整 | 需要额外处理 query param 解析与客户端筛选交互 |
| 额外新增 REST API 再由客户端拉取数据 | 前后端职责更传统 | 当前仓库没有这类前端数据访问惯例，接口层与状态同步成本更高 |

最终选择：**新增 `/original-content` 页面，并通过 Server Action 直接读取 `content_items + content_item_raws + sources`**。

## 架构设计

- `src/app/actions/original-content-actions.ts`
  - 新增原始内容读取 action
  - 统一处理 `range/sourceId/page` 查询参数、业务时区窗口与分页夹紧
  - 数据查询只依赖 `content_items + content_item_raws + sources`，不读取 `analysis_records`
- `src/app/original-content/page.tsx`
  - 作为新的 Server Component 页面入口
  - 服务端并行读取列表数据与来源选项
- `src/app/original-content/original-content-client.tsx`
  - 负责时间筛选、来源搜索单选与分页按钮交互
  - 通过 `router.replace` 同步 URL，改变筛选时重置到第一页
- `src/components/features/original-content-card.tsx`
  - 负责单条原始内容卡片展示
- `src/components/features/original-content-preview.ts`
  - 统一原始内容预览提取逻辑
  - 优先 `rawExcerpt`，回退 `rawBody`，剥离 HTML 并裁剪长度
- 导航壳层
  - `Sidebar` 新增 `Original Content`
  - `Header` 新增对应标题映射

## 相关文件

- `src/app/actions/original-content-actions.ts` — 原始内容查询与筛选解析
- `src/app/original-content/page.tsx` — `/original-content` 页面入口
- `src/app/original-content/original-content-client.tsx` — 筛选与分页交互
- `src/components/features/original-content-card.tsx` — 原始内容卡片
- `src/components/features/original-content-preview.ts` — 原始内容预览生成
- `src/components/layout/sidebar.tsx` — 侧边栏入口
- `src/components/layout/header.tsx` — 页面标题映射

## 相关变更记录

- `arch/006` — Task 2 RSS 抓取与内容入库
- `arch/014` — 前端 UI 架构与 Base UI 集成
- `arch/015` — 前端组件边界瘦身与流式渲染整理
