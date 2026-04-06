---
type: arch
number: "027"
date: 2026-04-06
title: OPML 导入后台化与受控并发收口
tags: [sources, opml, worker, queue, concurrency]
related: ["arch/020", "arch/016"]
---

# arch/027 OPML 导入后台化与受控并发收口

## 背景与动机

原有 OPML 导入在 Server Action 内直接同步执行整批导入。只要 OPML 中包含较多源，前端请求就会长时间阻塞，同时每个 RSS URL 的远程验证又是串行进行，整体耗时近似线性累加。

此外，导入过程中一边创建 source 一边立即触发首次抓取，会让用户面对“页面一直转圈”的交互问题，也放大了导入阶段的网络与数据库压力。

## 技术选型

| 方案 | 优点 | 缺点 |
|------|------|------|
| 保持 Server Action 同步执行 | 代码路径最短 | 大 OPML 易超时，用户长时间等待 |
| Server Action 只入队，worker 后台执行 | 交互及时返回，可复用现有 `source.import` worker | 需要补状态查询与前端轮询 |
| 直接全量 `Promise.all` 并发验证 | 实现简单，吞吐高 | 容易放大竞争与外部站点压力，重复源更易触发唯一键冲突 |

最终选择：

1. 复用现有 `source.import` 队列与 worker，把 OPML 导入改为后台执行。
2. 在服务层使用受控并发而不是无上限并发，当前固定为 5。
3. 对 source 创建增加唯一键冲突兜底，把并发竞争收敛为 `skipped_duplicate`。

## 架构设计

### 1. 导入入口后台化

- `importSourcesFromOpml` 不再直接调用 `runSourceImport`
- 新增 `enqueueOpmlSourceImport`，先创建 `source_import_runs` 记录，再把 job 入队到现有 legacy import queue
- worker 执行 `runSourceImport` 时复用预创建的 `importRunId`

### 2. 导入状态查询

- 新增 `getSourceImportRunProgress` 服务函数
- 新增 `getOpmlImportRunStatus` Server Action
- 前端提交 OPML 后展示“已提交/等待执行/导入中”状态，并按 `importRunId` 轮询

### 3. 批量导入受控并发

- OPML URL 先做去空与去重，避免同一文件内完全相同的 URL 重复验证
- 使用受控并发执行远程校验与导入，替代原先的串行 `for...of`
- 保持结果数组按输入顺序汇总，但 item 明细写入顺序允许按真实完成顺序落库

### 4. 并发幂等兜底

- 保留 `findSourceByIdentifier` 预检查
- 对 `createSource` 触发的 PostgreSQL 唯一键冲突 (`23505`) 做回查
- 回查命中时将结果视为重复导入，而不是失败

## 相关文件

- `src/services/source-import.ts` — 新增后台入队、进度查询、受控并发与唯一键冲突兜底
- `src/app/actions/source-actions.ts` — 新增 OPML 入队入口与导入状态查询 action
- `src/app/sources/sources-client.tsx` — 改为提交后轮询导入状态，并展示运行中摘要
- `src/services/source-import.test.ts` — 覆盖预创建 run、并发导入与唯一键竞争
- `src/app/actions/source-actions.test.ts` — 覆盖异步入队与状态查询
- `src/app/sources/sources-client.test.ts` — 覆盖 queued/running/completed 的交互反馈

## 验证

- `bun test src/services/source-import.test.ts src/app/actions/source-actions.test.ts src/app/sources/sources-client.test.ts`
- `bun run check && bun run typecheck`

## 相关变更记录

- `arch/020` — Sources 页面 OPML 导入入口与结果摘要
- `arch/016` — 多 Worker 队列路由与任务命名收口
