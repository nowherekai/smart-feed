---
type: arch
number: "013"
date: 2026-03-31
title: Task 8 调度层与 Worker 生命周期收口
tags: [backend, scheduler, bullmq, worker, digest]
related: ["arch/006", "arch/012"]
---

# arch/013 Task 8 调度层与 Worker 生命周期收口

## 背景与动机

在 `Task 7` 完成后，`source.fetch`、`digest.compose`、`digest.deliver` 等后端链路已经具备真实业务逻辑，但系统仍缺少实际可运行的调度层：

- 没有定时触发 active source 抓取
- 没有按 Digest 业务时区在本地 `08:00` 触发日报编排
- Worker 进程启动与退出时，没有统一管理 BullMQ job scheduler 的注册与清理

如果继续依赖手动触发，后台链路虽然“可执行”，但不能构成稳定的周期任务闭环。因此需要把 Task 8 的调度层正式落地，并把调度器生命周期收口到 Worker 入口。

## 技术选型

| 方案 | 优点 | 代价 |
|------|------|------|
| 使用 BullMQ `upsertJobScheduler` + `pattern/tz` | 调度元数据由 BullMQ 持久化，天然适合时区化定时任务 | 需要在 Worker 停止时显式移除 scheduler |
| 使用进程内 `setInterval` / cron | 实现直接 | 与 BullMQ 队列模型割裂，不利于重试、观测与多进程一致性 |
| 为每个 source 单独注册 repeatable job | 调度粒度细 | source 生命周期同步复杂，超出当前 Task 8 最小范围 |

最终选择：**使用 BullMQ job scheduler 注册两个固定调度条目，并用一个内部调度 job 扫描 active source**。

## 架构设计

- `src/scheduler/jobs.ts`
  - 注册两个固定 scheduler：
    - `scheduler.sources.sync.hourly`
    - `scheduler.digest.compose.daily`
  - Digest 调度使用 `pattern + tz`，按 `SMART_FEED_DIGEST_TIMEZONE` 本地时间触发；未配置时回退应用时区
  - 补充 scheduler 移除逻辑，保证 Worker 停止时撤销 Redis 中的持久化调度定义
- `src/pipeline/handlers/scheduler-sources-sync.ts`
  - 新增内部 job `scheduler.sources.sync`
  - 每小时查询所有 `status = active` 的 source，并下发 `source.fetch`
  - 对 `source.fetch` 使用统一 deduplication id，保证同一 source 同时最多只有一个待执行/执行中的抓取任务
  - `queuedSourceCount` 仅统计实际新入队的任务，避免 dedup 命中时虚高
- `src/workers/index.ts`
  - Worker 启动时先创建 Worker，再注册 scheduler
  - Worker 关闭时按 `worker -> scheduler -> redis` 顺序优雅停止
  - 保留 `import.meta.main` 入口，同时抽出可测试的 `startWorkerApp`
- `src/services/source-import.ts`
  - 首次导入触发的 `source.fetch` 也复用相同 dedup key，避免与定时调度在边界时刻重复排队

## 相关文件

- `src/scheduler/` — 调度器定义、启动/停止、测试
- `src/pipeline/handlers/scheduler-sources-sync.ts` — active source 扫描与定时抓取下发
- `src/queue/config.ts` — 内部调度 job 名与 `source.fetch` dedup key
- `src/services/source.ts` — active source 查询
- `src/services/source-import.ts` — 首次抓取复用 dedup 语义
- `src/workers/index.ts` — Worker 生命周期与调度器集成
- `docs/plan/backend-implementation-plan.md` — Task 8 完成状态与时区调度口径

## 相关变更记录

- `arch/006` — Task 2 RSS 抓取与内容入库
- `arch/012` — Digest Delivery 可配置 SMTP 投递与 Runtime 交接
