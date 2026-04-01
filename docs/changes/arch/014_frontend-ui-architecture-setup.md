---
type: arch
number: "014"
date: 2026-04-01
title: 前端 UI 架构与 Base UI 集成
tags: [feat, frontend, tailwind, ui]
related: []
---

# arch/014 前端 UI 架构与 Base UI 集成

## 背景与动机
本项目开始进入前端 UI 研发阶段。由于这是一个基于 Next.js 16 (App Router) 构建的结构化情报系统，需要一套能高度自定义、兼具开发体验和极简风格的 UI 框架基础，支持响应式布局及顺滑的交互反馈，并符合项目代码极验的约束。

## 技术选型
| 技术方案 | 选择理由 |
|------|------|
| Tailwind CSS v4 | 最新大版本，精简了全量生态依赖栈，提供了原生的 OKLCH 颜色与 `@theme` 定义支持，能够以极简的主题配置完成 CSS Variable 的全盘映射。|
| shadcn/ui (Base UI) | "复制即拥有"，不强制封装黑盒式结构，使我们保持对核心底层组件 (`<button>`, `<label>`) 及其无障碍标准 (a11y) 的绝对控制。 |
| Zustand | 极度轻量的 React 状态管理。借助原生的 `persist` 插件迅速搭建出无需后端的联调 Mock 环境体系。 |
| Framer Motion | 纯声明式的动效库。主要用于微交互动效（如 Dashboard 的透明进入和悬浮阻尼感），拉升整体极客质感。 |
| Biome 补丁 | 为适配新兴的 Tailwind v4 特殊指令语法 (`@plugin` 等)，配置了 `tailwindDirectives` AST 解析能力，以保全完整的 0 Errors Lint 构建生命线。 |

## 架构设计
- **布局划分**：确立全局的边栏导航 (Sidebar) 与顶部沉浸搜索 (Header) 配合的 `RootLayout`。
- **静态路由**：装配了包含 Dashboard, Daily Digest, Sources, Settings 四块核心业务基础骨架页面。
- **纯客户端分离**：受制于首版状态仅有浏览器支撑 (`mockMode: true`)，核心存储均置于纯客户端并借助 `uuid` 等机制实现了无源端状态更新。

## 相关文件
- `src/app/globals.css` — 替换旧版样式，注入全局 Tailwind 语法树和 OKLCH 主题色变量池。
- `src/app/` — 全局路由页面栈。
- `src/components/ui/` — 底层复用原子件。
- `src/components/features/` — 核心聚合情报卡片件 (`IntelligenceCard`, `DigestItem`)。
- `src/lib/store.ts` — 前端 Mock 态数据核心集散地。
- `biome.json` — 核心 CSS AST 解析扩展补位。

## 相关变更记录
暂无。
