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
| [017](arch/017_worker-bull-board-monitor.md) | 2026-04-01 | Worker 独立端口 bull-board 队列监控 |
| [018](arch/018_multi-worker-implementation-and-log-enhancement.md) | 2026-04-01 | 多 Worker 职能队列完整实现与日志增强 |
| [019](arch/019_sources-page-rss-validation-and-auto-title.md) | 2026-04-01 | Sources 页面单条 RSS 导入校验与自动标题 |
| [020](arch/020_sources-page-opml-import-entry-and-result-summary.md) | 2026-04-01 | Sources 页面 OPML 导入入口与结果摘要 |
| [021](arch/021_original-content-feed-page-and-filters.md) | 2026-04-02 | Original Content 时间流页面与筛选导航 |
| [022](arch/022_original-content-detail-page-and-ai-debug-entry.md) | 2026-04-02 | Original Content 详情页与 AI 调试入口 |
| [023](arch/023_service-layer-structured-logging-and-log-guardrails.md) | 2026-04-02 | 服务层结构化日志增强与日志边界收敛 |
| [024](arch/024_backend-scoped-log-format-unification.md) | 2026-04-02 | 后端组件化日志格式统一 |
| [025](arch/025_ai-client-modular-refactor.md) | 2026-04-04 | AI Client 模块化拆分与职责分离 |
| [026](arch/026_ai-summary-contract-reset-and-digest-link-first.md) | 2026-04-06 | AI 摘要契约重构与 Digest 回链优先 |
| [027](arch/027_opml-import-background-runtime-and-concurrency.md) | 2026-04-06 | OPML 导入后台化与受控并发收口 |
| [028](arch/028_analysis-feed-page-and-navigation.md) | 2026-04-07 | Analysis 页面与情报列表导航 |
| [029](arch/029_stats-mvp-page-and-query-layer.md) | 2026-04-07 | Stats MVP 页面与查询层 |
| [030](arch/030_sources-page-rss-opml-export.md) | 2026-04-07 | Sources 页面全量 RSS OPML 导出 |
| [031](arch/031_ops-insights-admin-page.md) | 2026-04-07 | Ops Insights 管理页与运行聚合视图 |
| [032](arch/032_digest-archive-web-interface.md) | 2026-04-09 | 新增 Digest Reports 网页归档 |
| [033](arch/033_digest-archive-structured-markdown-rendering.md) | 2026-04-11 | Digest Archive 结构化 Markdown 渲染 |

## 运维变更

| 编号 | 日期 | 标题 |
|------|------|------|
| [001](ops/001_github-actions-ci-lockfile-enforcement.md) | 2026-03-31 | GitHub Actions CI 锁定 Bun lockfile |

## 故障修复

| 编号 | 日期 | 标题 |
|------|------|------|
| [001](fix/001_drizzle-cli-env-loading.md) | 2026-04-01 | Drizzle CLI 未读取 .env.local 的迁移失败修复 |
| [002](fix/002_resolve-digest-ssr-boundary-error.md) | 2026-04-01 | 修复 Digest 页面 SSR 边界错误 |
| [003](fix/003_repair-digest-list-filter-and-grouping.md) | 2026-04-06 | 修复 Digest 列表筛选与分类分组回归 |
| [004](fix/004_remove-digest-category-grouping-duplication.md) | 2026-04-07 | 移除 Digest 页面分类分组重复展示 |
| [005](fix/005_prevent-digest-report-item-duplication-across-lookback-window.md) | 2026-04-09 | 修复 Digest Report 跨窗口重复收录 |
