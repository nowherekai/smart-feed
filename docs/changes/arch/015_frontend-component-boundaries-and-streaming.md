---
type: arch
number: "015"
date: 2026-04-01
title: 前端组件边界瘦身与流式渲染整理
tags: [frontend, rsc, suspense, performance]
related: ["arch/014"]
---

# arch/015 前端组件边界瘦身与流式渲染整理

## 背景与动机
首版前端虽然已经跑通 Dashboard、Digest、Sources、Settings 四个核心页面，但组件边界仍偏粗：完整数据库记录被直接传入客户端组件，多个页面在路由根部等待数据后再返回 UI，少量静态页面还为了简单入场动画引入了额外的客户端依赖。这些写法在功能上可用，但会放大 RSC 序列化体积、阻断页面壳体首屏输出，并带来误导性的占位交互。

## 技术选型
| 技术方案 | 选择理由 |
|------|------|
| Server Component 优先 | 情报卡片和 Digest 条目本质上是展示节点，应该由服务端直接输出，减少客户端边界。 |
| 小型 client leaf 组件 | Tooltip 这类必须依赖浏览器交互的能力单独收敛成极小叶子节点，避免整张卡片 client 化。 |
| Suspense 流式边界 | 让 `/`、`/digest`、`/sources` 先返回页面外壳与 skeleton，再异步填充数据区，改善首屏感知速度。 |
| 前端专用 view model | 在页面层把数据库实体映射为最小渲染数据，避免把未使用字段序列化进客户端。 |
| CSS/Tailwind 动画 | 对简单入场动画继续使用现有 Tailwind 动画类，不再为此保留 `framer-motion` 页面级依赖。 |

## 架构设计
- **展示组件瘦身**：`IntelligenceCard` 与 `DigestItem` 改成服务端展示组件，只接收最小摘要 view model。
- **交互叶子下沉**：证据提示抽成独立 `EvidenceTooltip` 客户端组件，单独承担 tooltip 交互。
- **页面流式化**：Dashboard、Digest、Sources 路由改成静态壳体 + `Suspense` 数据区结构，fallback 使用 skeleton 占位。
- **来源列表一致性**：`SourcesClient` 改用最小 `SourceListItem` 数据形状，保留 optimistic UI，但每次 mutation 后统一 `router.refresh()` 对账，并改用 toast 反馈失败。
- **无效交互清理**：移除 Header 中未接线搜索框和卡片上的 `Read More` 占位按钮，避免误导用户。

## 相关文件
- `src/app/page.tsx` — Dashboard 页面改为 `Suspense` 包裹的数据区。
- `src/app/digest/page.tsx` — Digest 页面改为流式分组渲染。
- `src/app/sources/page.tsx` — Sources 页面增加服务端映射与 skeleton fallback。
- `src/app/sources/sources-client.tsx` — 来源列表 optimistic UI、toast 与 refresh 对账逻辑。
- `src/components/features/` — 展示组件最小化 props，并新增证据 tooltip 与摘要 view model。
- `src/components/layout/header.tsx` — 清理未接线搜索框。

## 相关变更记录
- `arch/014` — 前端 UI 架构与 Base UI 集成
