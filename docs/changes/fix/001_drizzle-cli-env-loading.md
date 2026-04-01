---
type: fix
number: "001"
date: 2026-04-01
title: Drizzle CLI 未读取 .env.local 的迁移失败修复
tags: [database, drizzle, migration, env, bun]
related: ["arch/002"]
---

# fix/001 Drizzle CLI 未读取 .env.local 的迁移失败修复

## 事件概述

- 发现时间：2026-04-01
- 影响范围：本地执行 `bun run db:migrate`、`db:generate`、`db:push`、`db:studio` 等依赖 `drizzle.config.ts` 的命令
- 严重程度：中

## 时间线

- 2026-04-01 20:xx - 本地执行 `bun run db:migrate`，`drizzle-kit` 报错缺少 `DATABASE_URL`
- 2026-04-01 20:xx - 确认 `.env.local` 已配置，但 CLI 链路未自动注入环境变量
- 2026-04-01 20:xx - 在共享数据库环境读取层补充 `.env.local` / `.env` 显式兜底加载，并补测试

## 根因分析

直接原因是 `src/db/env.ts` 只读取 `process.env.DATABASE_URL`，默认假设 Bun/Next.js 会自动完成 `.env.local` 注入；但 `bunx drizzle-kit` 这类 CLI 链路并不稳定满足该前提。

根本原因是架构文档 `arch/002` 已明确指出不能依赖 CLI 自动加载 `.env.local`，但实现没有把这条约束真正落到共享 env 读取逻辑里，导致设计与代码脱节。

## 修复方案

### 临时修复

执行命令前手动 `export DATABASE_URL=...` 可以绕过问题，但不适合作为长期约定。

### 根本修复

在 `src/db/env.ts` 中加入显式 env 文件回退逻辑：

- 优先读取当前 `process.env`
- 若缺失，则按 `.env.local`、`.env` 顺序读取 `DATABASE_URL` / `DATABASE_SSL`
- 解析后回填到 `process.env`，保证 `drizzle-kit` 与运行时代码共用同一结果
- 新增 `src/db/env.test.ts` 覆盖 CLI 场景、`.env.local` 优先级、`.env` 回退和缺失报错场景

## 预防措施

- [ ] 后续新增基础设施 env 读取模块时，默认补充“CLI 不自动注入 env 文件”的测试用例
- [ ] 复查其他直接依赖 `process.env` 的 CLI 入口，避免出现同类隐式前提
