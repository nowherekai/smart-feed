---
type: arch
number: "003"
date: 2026-03-31
title: Next.js 与 BullMQ Worker 单体骨架
tags: [nextjs, bullmq, scaffold, bun]
related: ["arch/002"]
---

# arch/003 Next.js 与 BullMQ Worker 单体骨架

## 背景与动机

当前仓库只有 Bun 单入口与数据库层，尚未形成系统规格中要求的两类运行单元：

- Next.js 全栈 Web 应用
- BullMQ 驱动的独立 pipeline worker

如果继续在单入口上直接堆叠 pipeline 逻辑，后续会同时面对目录结构重排、运行时职责混杂和构建链路切换，开发成本会持续上升。因此先落地最小可启动骨架，把 Web 与后台任务的边界固定下来。

## 技术选型

| 方案 | 优点 | 代价 |
|------|------|------|
| 单包同仓：根目录直接承载 Next.js + worker | 保持当前 Bun repo 结构，迁移成本低，便于共享 db/queue 模块 | 需要在同一 `package.json` 中同时维护 Web 与 worker 脚本 |
| 多应用分目录：`apps/web` + `apps/worker` | 隔离更强 | 当前仓库体量小，引入额外层级会增加初始化成本 |

最终选择：**单包同仓**。  
理由是当前项目仍处于骨架阶段，优先降低重构和移动文件的成本，同时为下一步 pipeline 实现保留共享模块空间。

## 架构设计

本次骨架确定以下边界：

- `src/app/` 作为 Next.js App Router 入口，只提供最小可启动页面与顶层业务目录占位
- `src/queue/` 统一承载 BullMQ 队列名、Redis 连接与共享 worker 配置
- `src/pipeline/` 统一导出 pipeline handler 映射，先使用占位处理器保持注册链路稳定
- `src/workers/index.ts` 作为独立 worker 进程入口，负责启动、监听与优雅退出
- `src/db/` 继续保留现有 Drizzle 层，不迁移目录；但数据库环境读取改为惰性初始化，避免 Web 仅渲染首页时因为未配置数据库而启动失败

同时补齐以下基础能力：

- `package.json` 增加 `dev:web`、`dev:worker`、`worker`、`build:web`、`build:worker`、`build`、`start`
- 新增 Next.js 根配置、全局样式和最小首页
- `.env.example` 补充 `REDIS_URL`
- `build:worker` 指定 `--target bun`，保证 BullMQ/ioredis 可以打包

## 相关文件

- `package.json` — Web/worker 双入口脚本与依赖
- `next.config.ts` — Next.js 根配置
- `src/app/` — Web 骨架入口
- `src/queue/` — 队列与 Redis 连接基础设施
- `src/pipeline/` — pipeline 占位处理器映射
- `src/workers/index.ts` — worker 启动入口
- `src/db/env.ts` — 惰性数据库环境读取
- `src/db/client.ts` — 惰性数据库客户端初始化

## 相关变更记录

- `arch/002` — 统一 Drizzle 共享数据库层与迁移配置
