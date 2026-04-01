---
type: arch
number: "018"
date: 2026-04-01
title: 多 Worker 职能队列完整实现与日志增强
tags: [backend, worker, logging, testing]
related: ["arch/016"]
---

# arch/018 多 Worker 职能队列完整实现与日志增强

## 背景与动机
为了实现生产级的任务调度与处理，需要将原本单一的 `smart-feed` 队列拆分为多个具有明确职能的队列。同时，为了方便开发者进行全流程测试和线上排障，需要增强系统在关键 Pipeline 节点的日志输出。

## 技术选型
- **5 个职能队列**：`source-dispatch`, `ingestion`, `content`, `ai`, `digest`。
- **结构化日志**：使用 `logger.info` 在 Service 层入口和 Handler 启动处注入上下文（Context ID, Trigger 等）。
- **全流程教程**：新增 `docs/tutorials/pipeline-testing.md` 引导开发者使用 Dummy AI 模式进行本地集成测试。

## 架构设计
- **队列路由**：通过 `getQueueForTask` 统一任务入队逻辑，基于 `SmartFeedTaskName` 自动分发。
- **并发策略**：AI 队列设为 `concurrency: 1` 防止 RPM 429；内容抓取设为 `concurrency: 5` 提高吞吐。
- **可观测性**：各队列独立监控，日志携带 `jobId` 和业务 `id`（如 `sourceId`, `contentId`）。

## 相关文件
- `src/queue/` — 核心路由与连接管理。
- `src/pipeline/handlers/` — 增加了处理器级别的启动日志。
- `src/services/` — 增加了业务流程入口的参数日志。
- `docs/tutorials/pipeline-testing.md` — 全流程测试指南。

## 相关变更记录
- `arch/016` — 提出了多队列路由与重命名的方案。
