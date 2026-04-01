---
type: fix
number: "002"
date: 2026-04-01
title: 修复 Digest 页面 SSR 边界错误
tags: [nextjs, ssr, bugfix, ui]
related: []
---

# fix/002 修复 Digest 页面 SSR 边界错误

## 事件概述
- 发现时间：2026-04-01
- 影响范围：Digest 详情页面
- 严重程度：中（页面无法加载）

## 时间线
- 21:10 — 访问 `/digest` 页面时触发运行时错误
- 21:15 — 确定原因为 `buttonVariants` 触发了 Next.js 的 SSR 边界限制
- 21:19 — 完成逻辑抽离与修复

## 根因分析
`buttonVariants` 由 `cva` 定义并由 `src/components/ui/button.tsx` 导出。由于该文件顶部带有 `"use client"` 指令，Next.js 15+ 严禁从 Server Component 直接调用来自客户端入口的非组件导出。`DigestItem` 在服务端渲染时尝试调用此函数生成类名，导致崩溃。

## 修复方案
### 临时修复
无。

### 根本修复
将 `buttonVariants` 的定义和 `ButtonVariants` 类型从 `button.tsx` 抽离到新建的共享文件 `src/components/ui/button-variants.ts` 中。该文件不包含 `"use client"`，纯粹导出样式生成逻辑，从而支持在服务端和客户端无缝复用。

## 预防措施
- [x] 对于 shadcn/ui 组件中的 `cva` 样式逻辑，优先采用独立的物理文件（如 `*-variants.ts`）抽离，避免与 React 组件的客户端属性耦合。
