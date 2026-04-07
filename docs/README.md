# Docs

## 变更记录

### 架构变更

| 编号 | 日期 | 标题 |
|------|------|------|
| [001](changes/arch/001_initial-database-schema.md) | 2026-03-30 | smart-feed 首版数据库 Schema 设计 |
| [002](changes/arch/002_drizzle-shared-db-and-migrations.md) | 2026-03-30 | 统一 Drizzle 共享数据库层与迁移配置 |
| [003](changes/arch/003_nextjs-worker-monolith-scaffold.md) | 2026-03-31 | Next.js 与 BullMQ Worker 单体骨架 |
| [004](changes/arch/004_task0-backend-infra-and-pipeline-tracking.md) | 2026-03-31 | Task 0 后端基础工具层与 Pipeline Tracking |
| [005](changes/arch/005_task1-source-import-pipeline.md) | 2026-03-31 | Task 1 来源接入 Pipeline |
| [006](changes/arch/006_task2-rss-fetch-and-content-ingestion.md) | 2026-03-31 | Task 2 RSS 抓取与内容入库 |
| [007](changes/arch/007_task3-html-fetch-and-normalize.md) | 2026-03-31 | Task 3 HTML 抓取与 Markdown 标准化 |
| [008](changes/arch/008_task4-ai-adapter-layer.md) | 2026-03-31 | Task 4 AI 适配层与显式 Provider 启用 |
| [009](changes/arch/009_content-pipeline-failure-gating-and-basic-analysis.md) | 2026-03-31 | Content Pipeline 通用失败阻断与基础分析最小闭环 |
| [010](changes/arch/010_content-heavy-runtime-and-traceability.md) | 2026-03-31 | Content Heavy Analysis 接入统一 Runtime 与可追溯落库 |
| [011](changes/arch/011_digest-compose-runtime-and-atomic-persistence.md) | 2026-03-31 | Digest Compose 接入统一 Runtime 与原子化持久化 |
| [012](changes/arch/012_digest-delivery-configurable-smtp-and-runtime-handoff.md) | 2026-03-31 | Digest Delivery 可配置 SMTP 投递与 Runtime 交接 |
| [013](changes/arch/013_task8-scheduler-layer-and-worker-lifecycle.md) | 2026-03-31 | Task 8 调度层与 Worker 生命周期收口 |
| [014](changes/arch/014_frontend-ui-architecture-setup.md) | 2026-04-01 | 前端 UI 架构与 Base UI 集成 |
| [015](changes/arch/015_frontend-component-boundaries-and-streaming.md) | 2026-04-01 | 前端组件边界瘦身与流式渲染整理 |
| [016](changes/arch/016_multi-worker-queue-routing-and-task-rename.md) | 2026-04-01 | 多 Worker 队列路由与任务命名收口 |
| [017](changes/arch/017_worker-bull-board-monitor.md) | 2026-04-01 | Worker 独立端口 bull-board 队列监控 |
| [018](changes/arch/018_multi-worker-implementation-and-log-enhancement.md) | 2026-04-01 | 多 Worker 职能队列完整实现与日志增强 |
| [019](changes/arch/019_sources-page-rss-validation-and-auto-title.md) | 2026-04-01 | Sources 页面单条 RSS 导入校验与自动标题 |
| [020](changes/arch/020_sources-page-opml-import-entry-and-result-summary.md) | 2026-04-01 | Sources 页面 OPML 导入入口与结果摘要 |
| [021](changes/arch/021_original-content-feed-page-and-filters.md) | 2026-04-02 | Original Content 时间流页面与筛选导航 |
| [022](changes/arch/022_original-content-detail-page-and-ai-debug-entry.md) | 2026-04-02 | Original Content 详情页与 AI 调试入口 |
| [023](changes/arch/023_service-layer-structured-logging-and-log-guardrails.md) | 2026-04-02 | 服务层结构化日志增强与日志边界收敛 |
| [024](changes/arch/024_backend-scoped-log-format-unification.md) | 2026-04-02 | 后端组件化日志格式统一 |
| [025](changes/arch/025_ai-client-modular-refactor.md) | 2026-04-04 | AI Client 模块化拆分与职责分离 |
| [026](changes/arch/026_ai-summary-contract-reset-and-digest-link-first.md) | 2026-04-06 | AI 摘要契约重构与 Digest 回链优先 |
| [027](changes/arch/027_opml-import-background-runtime-and-concurrency.md) | 2026-04-06 | OPML 导入后台化与受控并发收口 |
| [028](changes/arch/028_analysis-feed-page-and-navigation.md) | 2026-04-07 | Analysis 页面与情报列表导航 |
| [029](changes/arch/029_stats-mvp-page-and-query-layer.md) | 2026-04-07 | Stats MVP 页面与查询层 |
| [030](changes/arch/030_sources-page-rss-opml-export.md) | 2026-04-07 | Sources 页面全量 RSS OPML 导出 |

### 运维变更

| 编号 | 日期 | 标题 |
|------|------|------|
| [001](changes/ops/001_github-actions-ci-lockfile-enforcement.md) | 2026-03-31 | GitHub Actions CI 锁定 Bun lockfile |

### 故障修复

| 编号 | 日期 | 标题 |
|------|------|------|
| [001](changes/fix/001_drizzle-cli-env-loading.md) | 2026-04-01 | Drizzle CLI 未读取 .env.local 的迁移失败修复 |
| [002](changes/fix/002_resolve-digest-ssr-boundary-error.md) | 2026-04-01 | 修复 Digest 页面 SSR 边界错误 |
| [003](changes/fix/003_repair-digest-list-filter-and-grouping.md) | 2026-04-06 | 修复 Digest 列表筛选与分类分组回归 |
| [004](changes/fix/004_remove-digest-category-grouping-duplication.md) | 2026-04-07 | 移除 Digest 页面分类分组重复展示 |
