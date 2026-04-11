---
type: arch
number: "033"
date: 2026-04-11
title: Digest Archive 结构化 Markdown 渲染
tags: [frontend, digest, markdown, nextjs]
related: ["arch/032"]
---

# arch/033 Digest Archive 结构化 Markdown 渲染

## 背景与动机
`/digests/[date]` 已能读取 `digest_reports.markdownBody`，但详情页此前通过 `marked` 生成 HTML 后直接注入页面。该实现虽然可显示内容，但正文结构和样式控制较弱，也把渲染安全边界放在了字符串 HTML 上。当前改动目标是保持归档头部与历史数据不变，仅升级正文渲染层，让日报正文以结构化 Markdown 组件输出，并与现有归档阅读场景对齐。

## 技术选型

| 方案 | 优点 | 缺点 |
|------|------|------|
| `marked` + `dangerouslySetInnerHTML` | 接入快，历史实现已存在 | 依赖字符串 HTML 注入，样式和安全边界较弱 |
| `react-markdown` 结构化渲染 | 直接输出 React 结构，便于逐元素控样式，默认可跳过原始 HTML | 新增一个渲染依赖 |

最终选择 `react-markdown`，并通过组件级元素映射统一控制 `h1/h2/h3`、引用、列表、链接与分隔线的样式。

## 架构设计
- 新增 `DigestMarkdownContent` 组件，作为归档详情页正文的唯一渲染入口。
- 详情页继续直接消费数据库中的 `markdownBody`，不改写历史 digest 内容，也不调整查询接口。
- 正文渲染启用 `skipHtml`，避免把原始 HTML 当可信内容输出。
- 现有 `.prose-custom` 样式保留，但针对日报正文层级重新收敛了标题间距、列表缩进、引用块背景和链接样式。

## 相关文件
- `src/app/digests/[date]/page.tsx` — 归档详情页改为结构化 Markdown 组件渲染
- `src/components/features/digest-markdown-content.tsx` — Digest Markdown 正文渲染组件
- `src/components/features/digest-markdown-content.test.tsx` — 正文渲染与 HTML 跳过测试
- `src/app/globals.css` — 日报正文样式调整
- `package.json` — 新增 `react-markdown` 依赖

## 相关变更记录
- `arch/032` — 新增 Digest Reports 网页归档
