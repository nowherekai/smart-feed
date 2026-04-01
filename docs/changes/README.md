# Changes

## 架构变更

| 编号 | 日期 | 标题 |
|------|------|------|
| [001](arch/001_initial-database-schema.md) | 2026-03-30 | smart-feed 首版数据库 Schema 设计 |
| [002](arch/002_drizzle-shared-db-and-migrations.md) | 2026-03-30 | 统一 Drizzle 共享数据库层与迁移配置 |
| [003](arch/003_nextjs-worker-monolith-scaffold.md) | 2026-03-31 | Next.js 与 BullMQ Worker 单体骨架 |
| [004](arch/004_task0-backend-infra-and-pipeline-tracking.md) | 2026-03-31 | Task 0 后端基础工具层与 Pipeline Tracking |
| [005](arch/005_task1-source-import-pipeline.md) | 2026-03-31 | Task 1 来源接入 Pipeline |
| [006](arch/006_task2-rss-fetch-and-content-ingestion.md) | 2026-03-31 | Task 2 RSS 抓取与内容入库 |
| [007](arch/007_task3-html-fetch-and-normalize.md) | 2026-03-31 | Task 3 HTML 抓取与 Markdown 标准化 |
| [008](arch/008_task4-ai-adapter-layer.md) | 2026-03-31 | Task 4 AI 适配层与显式 Provider 启用 |
| [009](arch/009_content-pipeline-failure-gating-and-basic-analysis.md) | 2026-03-31 | Content Pipeline 通用失败阻断与基础分析最小闭环 |
| [010](arch/010_content-heavy-runtime-and-traceability.md) | 2026-03-31 | Content Heavy Analysis 接入统一 Runtime 与可追溯落库 |
| [011](arch/011_digest-compose-runtime-and-atomic-persistence.md) | 2026-03-31 | Digest Compose 接入统一 Runtime 与原子化持久化 |
| [012](arch/012_digest-delivery-configurable-smtp-and-runtime-handoff.md) | 2026-03-31 | Digest Delivery 可配置 SMTP 投递与 Runtime 交接 |
| [013](arch/013_task8-scheduler-layer-and-worker-lifecycle.md) | 2026-03-31 | Task 8 调度层与 Worker 生命周期收口 |
| [014](arch/014_frontend-ui-architecture-setup.md) | 2026-04-01 | 前端 UI 架构与 Base UI 集成 |
| [015](arch/015_frontend-component-boundaries-and-streaming.md) | 2026-04-01 | 前端组件边界瘦身与流式渲染整理 |
| [016](arch/016_multi-worker-queue-routing-and-task-rename.md) | 2026-04-01 | 多 Worker 队列路由与任务命名收口 |

## 运维变更

| 编号 | 日期 | 标题 |
|------|------|------|
| [001](ops/001_github-actions-ci-lockfile-enforcement.md) | 2026-03-31 | GitHub Actions CI 锁定 Bun lockfile |

## 故障修复

| 编号 | 日期 | 标题 |
|------|------|------|
