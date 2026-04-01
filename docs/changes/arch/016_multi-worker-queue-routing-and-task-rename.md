---
type: arch
number: "016"
date: 2026-04-01
title: 多 Worker 队列路由与任务命名收口
tags: [backend, worker, bullmq, queue, scheduler]
related: ["arch/003", "arch/013"]
---

# arch/016 多 Worker 队列路由与任务命名收口

## 背景与动机

原有后端 worker 仍然基于单队列 `smart-feed` + 单 Worker 运行，所有调度、抓取、分析、摘要任务共享同一消费入口。随着内容抓取和 AI 链路逐步补齐，这种结构已经无法表达不同任务的并发策略，也容易让项目内部的任务常量命名继续和 BullMQ `Job` 概念混淆。

因此本次调整需要同时完成两件事：

- 将主链路重构为多队列、多 Worker 的职能分工模型
- 将项目内任务常量从 `jobNames` / `JobName` 重命名为 `smartFeedTaskNames` / `SmartFeedTaskName`

## 技术选型

| 方案 | 选择理由 |
|------|------|
| 5 个职能队列 + 5 个主 Worker | 将调度、抓取、正文处理、AI、摘要链路解耦，便于独立并发与排障。 |
| `source.import` 暂时保留 legacy 入口 | 前端导入链路尚未跟着重构，本轮先保持兼容，避免打断现有导入能力。 |
| `getQueueForTask()` 显式按任务路由 | 所有主链路生产者统一通过任务类型选择队列，避免继续隐式落入旧单队列。 |
| 调度 gate 基于 `lastSuccessfulSyncAt` | 失败重试不再被 `lastPolledAt` 误伤，保持“最近成功同步”与“最近尝试时间”语义分离。 |

## 架构设计

- **队列分工**：主链路拆为 `source-dispatch`、`ingestion`、`content`、`ai`、`digest` 五个队列，各自有固定初始并发。
- **任务路由**：`scheduler.sources.sync`、`source.fetch`、`content.*`、`digest.*` 全部通过 `taskToQueueMap` 路由到目标队列。
- **导入兼容层**：`source.import` 仍由 legacy queue 消费，但它触发出来的 `source.fetch` 直接进入新的 ingestion 队列，避免任务滞留。
- **调度注册**：两个 repeatable job 分别注册到 `source-dispatch-queue` 与 `digest-queue`，不再共享单队列。
- **Worker 生命周期**：worker 入口改为启动 6 个 worker，其中 5 个主 Worker + 1 个 legacy import worker，关闭顺序统一为 worker -> scheduler -> redis。

## 相关文件

- `src/queue/` — 多队列配置、任务路由、legacy import 兼容 helper。
- `src/scheduler/` — 多队列 scheduler 注册与 registry 生命周期。
- `src/workers/index.ts` — 多 Worker 启动与优雅停机收口。
- `src/services/` — 主链路 enqueue 改为按任务路由，source 调度查询改为 due-for-sync。
- `src/pipeline/handlers/` — BullMQ 泛型第三参数统一切到 `SmartFeedTaskName`。

## 相关变更记录

- `arch/003` — Next.js 与 BullMQ Worker 单体骨架
- `arch/013` — Task 8 调度层与 Worker 生命周期收口
