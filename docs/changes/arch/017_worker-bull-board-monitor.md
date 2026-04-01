---
type: arch
number: "017"
date: 2026-04-01
title: Worker 独立端口 bull-board 队列监控
tags: [backend, worker, bull-board, queue, observability]
related: ["arch/016", "arch/013"]
---

# arch/017 Worker 独立端口 bull-board 队列监控

## 背景与动机

多 Worker / 多队列重构已经将主链路拆分为五个职能队列，但当前项目仍缺少统一的队列观测入口。继续将 bull-board 挂到 Next.js Web 进程会引入额外的 Web 服务形态变化，也不符合“不要影响 Next.js app”的实施约束。

因此本次调整改为在 worker 进程内部启动独立的 bull-board 管理服务，通过单独端口提供内部使用的队列监控界面。

## 技术选型

| 方案 | 选择理由 |
|------|------|
| worker 进程内独立 HTTP 服务 | 不改 Next.js app 与 Web server，队列看板跟随 worker 生命周期管理。 |
| `@bull-board/express` + `express` | 直接复用 bull-board 官方适配器，降低框架兼容成本。 |
| 默认绑定 `127.0.0.1:3010` | 仅本机可访问，先降低暴露面；后续如需外部访问，由部署层代理或统一鉴权接管。 |
| 复用 `getQueueRegistry()` | 避免额外维护队列列表与 Redis 连接，确保展示对象与实际 Worker 监听队列一致。 |

## 架构设计

- **服务位置**：bull-board 不再挂载到 Next.js 路由树，而是在 worker 进程启动后附带启动内部管理 HTTP 服务。
- **访问路径**：固定为 `http://<host>:<port>/admin/queues`，默认 `http://127.0.0.1:3010/admin/queues`。
- **队列覆盖**：展示 `source-dispatch`、`ingestion`、`content`、`ai`、`digest` 五个职能队列，不包含 legacy import queue。
- **生命周期**：worker 启动顺序调整为 `workers -> scheduler -> bull-board`，关闭顺序调整为 `bull-board -> workers -> scheduler -> legacy import queue -> redis`。
- **失败清理**：若 bull-board 启动失败，worker 启动流程会主动关闭已创建 worker、scheduler 和相关连接，避免半启动状态残留。

## 相关文件

- `src/workers/bull-board.ts` — bull-board HTTP 服务装配与启动/关闭。
- `src/workers/env.ts` — worker 侧 bull-board host/port 环境变量解析。
- `src/workers/index.ts` — bull-board 生命周期接入与启动失败清理。
- `.env.example` — 新增 `SMART_FEED_BULL_BOARD_HOST/PORT` 默认示例。

## 相关变更记录

- `arch/013` — Task 8 调度层与 Worker 生命周期收口
- `arch/016` — 多 Worker 队列路由与任务命名收口
