---
type: arch
number: "011"
date: 2026-03-31
title: Digest Compose 接入统一 Runtime 与原子化持久化
tags: [backend, pipeline, digest, runtime, transaction, markdown]
related: ["arch/010"]
---

# arch/011 Digest Compose 接入统一 Runtime 与原子化持久化

## 背景与动机

在 `arch/010` 完成 `content.analyze.heavy` 与 digest 准入能力后，系统已经具备生成日报所需的 `full` 分析记录与 traceability 数据，但 `digest.compose` 仍停留在占位状态，尚未形成真正的日报编排闭环。

本次变更补齐的目标是：

- 将 `digest.compose` 从 placeholder 落地为真实后端处理链路
- 基于 Digest 业务时区和发送时刻计算统计窗口
- 从 `content_items.effective_at` 收集可进入 Digest 的分析结果
- 生成包含完整 traceability 的 Markdown 报告
- 原子化写入 `digest_reports` 与 `digest_items`
- 通过独立 runtime 接入 `pipeline_runs` / `step_runs`

## 技术选型

| 方案 | 优点 | 代价 |
|------|------|------|
| 继续沿用 content runtime | 复用现有模式 | content runtime 强绑定 `contentId`，不适合 digest 任务 |
| 为 digest 单独补最小 runtime | 运行记录语义清晰，避免污染 content pipeline | 需要增加一层新的 runtime 封装 |
| digest 持久化使用事务 | 避免报告与条目部分成功 | 实现上多一层事务封装 |

最终选择：

- **新增 digest 专用 runtime**
- **将 digest_report + digest_items 的写入收敛到单事务**

## 架构设计

- `src/services/digest.ts`
  - 新增 `runDigestCompose()`
  - 使用 `getDigestWindow()` 计算 `windowStart/windowEnd`
  - 以 `windowEnd` 的业务时区日期生成 `digestDate`
  - 查询上一次 `status=sent` 的日报作为窗口锚点
  - 从 `content_items` + `analysis_records` + `sources` 收集候选数据
  - 过滤 blocked 来源、traceability 不完整记录和无可渲染摘要的记录
  - 同一 `contentId` 仅保留最新一条 `full` 记录
  - 通过事务统一处理新建/复用日报、删除旧条目、写入新条目
- `src/services/digest-renderer.ts`
  - 统一生成 Markdown 日报
  - 显式保留 `source_trace_id`、`content_trace_id`、原文链接、证据片段
  - 无内容时生成空日报正文
- `src/services/digest-pipeline-runtime.ts`
  - 为 `digest.compose` 创建独立的 pipeline runtime
  - 记录 `pipeline_name = digest-generation`
  - 在 `digest.compose` 成功后即完成当前 pipeline run，同时保留 `digest_id`
  - 即使后续 `digest.deliver` 仍是占位，也不会让本次 compose 记录长期卡在 `running`
- `src/pipeline/handlers/digest-compose.ts`
  - 通过 digest runtime 执行 compose step
- `src/pipeline/handlers/index.ts`
  - 将 `digest.compose` 从 placeholder 切换为真实 handler

## 关键行为

- 统计窗口：
  - `window_start = max(last_successful_digest_at, now_local_send_hour - max_lookback_hours)`
  - `window_end = now_local_send_hour`
- 收集规则：
  - 仅按 `content_items.effective_at` 判断是否纳入
  - 仅纳入 `analysis_records.status = full`
  - 排除 `sources.status = blocked`
  - 必须同时具备 `source_trace_id`、`source_name`、`content_trace_id`、`original_url`、`evidence_snippet`
- 重跑策略：
  - 同日 `sent` 日报直接跳过
  - 同日 `draft/ready/failed` 日报复用并重建内容
- 空日报：
  - 无内容时仍生成空报告，并继续入队 `digest.deliver`

## 相关文件

- `src/services/digest.ts` — Digest 编排与事务持久化
- `src/services/digest-renderer.ts` — Markdown 渲染
- `src/services/digest-pipeline-runtime.ts` — digest 专用 runtime
- `src/pipeline/handlers/digest-compose.ts` — compose handler
- `src/pipeline/handlers/index.ts` — compose handler 接线
- `src/services/digest.test.ts` — digest 服务测试
- `src/services/digest-renderer.test.ts` — renderer 测试
- `src/pipeline/handlers/digest-compose.test.ts` — handler/runtime 测试
- `docs/plan/backend-implementation-plan.md` — Task 6 完成状态

## 相关变更记录

- `arch/010` — Content Heavy Analysis 接入统一 Runtime 与可追溯落库
