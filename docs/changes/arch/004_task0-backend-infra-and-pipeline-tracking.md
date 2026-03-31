---
type: arch
number: "004"
date: 2026-03-31
title: Task 0 后端基础工具层与 Pipeline Tracking
tags: [backend, infra, pipeline, config, bun]
related: ["arch/003"]
---

# arch/004 Task 0 后端基础工具层与 Pipeline Tracking

## 背景与动机

在 `source.import`、`source.fetch` 等真实 pipeline handler 开始实现前，仓库虽然已经具备 Next.js、BullMQ、Drizzle 的基础骨架，但仍缺少后续任务共用的后端基础能力：

- 统一的业务环境变量读取与默认值约束
- 时间窗口与 Digest 统计窗口的公共计算逻辑
- URL 规范化与哈希能力
- 结构化日志工具
- Pipeline Run / Step Run 的数据库 CRUD 服务

如果继续在后续 Task 中临时分散补这些基础模块，容易造成时间逻辑不一致、环境变量解析重复、以及 pipeline 执行记录无统一入口的问题。因此先把 Task 0 所需的最小基础设施固定下来。

## 技术选型

| 方案 | 优点 | 代价 |
|------|------|------|
| 使用 Bun/Node 原生能力实现配置、时间与 URL 工具 | 无额外依赖，符合当前仓库约束，便于后续在 worker 与 Web 之间共享 | 时区换算需自行封装，但当前只需覆盖 `Asia/Shanghai` 这类无 DST 场景 |
| 引入额外配置/时区/日志库 | 功能更全 | 对当前 MVP 范围过重，增加依赖和维护成本 |

最终选择：**继续使用 Bun/Node 原生能力，围绕 Task 0 提供轻量基础模块**。

## 架构设计

本次变更固定了以下基础边界：

- `src/config/env.ts` 统一承载 `SMART_FEED_*`、`ANTHROPIC_API_KEY`、`SMTP_*` 的读取、默认值与范围校验，并通过环境签名做只读缓存
- `src/utils/time.ts` 提供 `getEffectiveTime`、`isInTimeWindow`、`getDigestWindow`，明确以当前 MVP 主要使用的 `Asia/Shanghai` 这类无夏令时业务时区为前提
- `src/utils/url.ts` 统一做 URL 规范化与 SHA-256 哈希，供后续内容去重使用
- `src/utils/logger.ts` 提供最小结构化日志输出，避免后续 handler 直接散落 `console.*`
- `src/services/pipeline-tracking.ts` 封装 `pipeline_runs` 与 `step_runs` 的创建、更新服务，作为后续各 pipeline step 的统一跟踪入口

同时补齐以下配套项：

- `.env.example` 增加 Task 0 依赖的 AI/SMTP 配置占位
- 为配置、时间、URL 与 pipeline tracking 增加 Bun 测试
- `docs/plan/backend-implementation-plan.md` 将 `Task 0` 标记为完成
- `AGENTS.md` 收敛为当前仓库协作中最关键的运行环境提示

## 相关文件

- `src/config/` — 统一环境变量配置与测试
- `src/utils/` — 时间、URL、日志工具与测试
- `src/services/pipeline-tracking.ts` — pipeline 运行记录服务
- `.env.example` — 新增 AI/SMTP 配置占位
- `docs/plan/backend-implementation-plan.md` — Task 0 完成状态
- `AGENTS.md` — 当前协作约束说明

## 相关变更记录

- `arch/003` — Next.js 与 BullMQ Worker 单体骨架
