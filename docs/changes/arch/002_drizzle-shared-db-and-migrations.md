---
type: arch
number: "002"
date: 2026-03-30
title: 统一 Drizzle 共享数据库层与迁移配置
tags: [database, drizzle, migration, postgresql, env]
related: ["arch/001"]
---

# arch/002 统一 Drizzle 共享数据库层与迁移配置

## 背景与动机

首版数据库 Schema 已经落库到 `src/db/schema.ts`，但仓库仍缺少可复用的数据库连接入口、环境变量读取约定，以及统一的 migration 管理配置。
如果继续由 Web 与 worker 各自创建数据库连接或各自维护 schema 路径，后续会出现配置分叉、迁移入口不一致和环境变量约定漂移的问题。

## 技术选型

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| 共享 `src/db` 入口 + Drizzle Kit | Web/worker 共用一套 schema、连接与 migration 约定 | 需要补充 env 加载与 CLI 配置 | 采用 |
| Web/worker 各自维护数据库接入 | 各模块独立 | 配置重复，容易漂移 | 不采用 |
| 依赖运行时自动加载 `.env.local` | 使用简单 | 对 `drizzle-kit` 这类 CLI 链路不稳定 | 不采用 |

## 数据模型

本次不新增业务表，仅围绕现有 schema 增加基础设施层：

- `src/db/env.ts`：统一读取 `DATABASE_URL` / `DATABASE_SSL`
- `src/db/client.ts`：创建 `postgres` 客户端与 Drizzle `db`
- `src/db/index.ts`：统一对外导出
- `drizzle.config.ts`：统一 migration / studio 配置
- `drizzle/`：migration 输出目录

## 架构设计

本次设计约束如下：

- `src/db/schema.ts` 继续作为唯一 schema 源
- 所有应用侧代码只通过共享 DB 入口访问 PostgreSQL
- `drizzle-kit` 与运行时都使用同一套 env 约定
- `.env.local` / `.env` 都可作为数据库连接配置来源
- migration 目录固定在仓库根 `drizzle/`

## 相关文件

- `src/db/env.ts` - 数据库环境变量加载与校验
- `src/db/client.ts` - PostgreSQL 客户端与 Drizzle 实例
- `src/db/index.ts` - 共享数据库导出入口
- `drizzle.config.ts` - Drizzle Kit 配置
- `package.json` - migration 相关脚本与依赖声明
- `.env.example` - 数据库环境变量示例
- `README.md` - 本地使用说明

## 相关变更记录

- `arch/001` - smart-feed 首版数据库 Schema 设计
