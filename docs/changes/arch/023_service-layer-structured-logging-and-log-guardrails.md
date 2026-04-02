---
type: arch
number: "023"
date: 2026-04-02
title: 服务层结构化日志增强与日志边界收敛
tags: [backend, logging, observability, worker]
related: ["arch/018", "arch/022"]
---

# arch/023 服务层结构化日志增强与日志边界收敛

## 背景与动机

当前内容抓取、标准化、分析、Digest 编排与投递虽然已经具备完整链路，但服务层日志粒度不一致。排查任务失败、缓存命中、跳过分支和 Runtime 推进时，往往还要回到数据库或手动补上下文。

同时，这次日志增强需要满足两个边界：

- 不应把完整原文内容、Markdown、HTML、XML 等长文本直接打入日志
- 不应把完整 URL、外部超长标题等不受控字段拼进错误消息或高频日志

## 技术选型

| 方案 | 优点 | 代价 |
|------|------|------|
| 在 Service / Runtime / Tracking 层补结构化日志，并统一传业务上下文 | 排障时能直接按 `contentId`、`sourceId`、`pipelineRunId`、`digestId` 追踪 | 需要明确哪些字段可打、哪些字段只能统计化 |
| 继续依赖 Handler 层日志或临时 `console.log` | 改动少 | 业务上下文不完整，跨步骤排查仍然困难 |
| 无差别记录外部标题、完整 URL、长文本摘要 | 可快速看到更多细节 | 会放大日志体积，并引入敏感 query / 超长字段泄露风险 |

最终选择：

- 在 `src/services/` 与 pipeline runtime/tracking 层增加结构化日志
- 长文本只记录长度、状态、计数、命中结果等摘要字段
- `debug` 日志在生产环境默认关闭，避免热路径日志放大
- 错误消息保持面向业务语义，不把完整 URL 拼进会落库或展示的字符串

## 架构设计

- `src/services/content.ts` / `analysis.ts` / `digest.ts` / `digest-delivery.ts`
  - 在步骤入口、缓存命中、AI 调用、结果持久化、失败分支补齐结构化上下文
- `src/services/pipeline-runtime.ts` / `digest-pipeline-runtime.ts`
  - 对 pipeline run / step run 的启动、推进、结束和 crash 增加可追踪日志
- `src/services/pipeline-tracking.ts`
  - 在 run / step 的创建与更新时补数据库操作级日志，便于串联运行轨迹
- `src/utils/logger.ts`
  - 保持统一 JSON 日志出口，并对 `debug` 级别增加生产环境门控
- `src/services/source.ts` / `html-fetcher.ts`
  - 对外部来源字段做日志收敛：标题记录长度与存在性，错误消息不含完整 URL

## 相关文件

- `src/utils/logger.ts` — 统一日志出口与 debug 级别门控
- `src/services/content.ts` — 来源抓取、HTML 抓取、标准化日志
- `src/services/analysis.ts` — 基础/深度分析与缓存命中日志
- `src/services/digest.ts` — Digest 选择、渲染、持久化日志
- `src/services/digest-delivery.ts` — 邮件投递与幂等日志
- `src/services/pipeline-runtime.ts` — Content Pipeline Runtime 日志
- `src/services/digest-pipeline-runtime.ts` — Digest Pipeline Runtime 日志
- `src/services/pipeline-tracking.ts` — Pipeline/Step Tracking 数据库日志
- `src/services/source.ts` — RSS 验证日志字段收敛
- `src/services/html-fetcher.ts` — HTML 抓取错误文案收敛

## 相关变更记录

- `arch/018` — 多 Worker 职能队列完整实现与日志增强
- `arch/022` — Original Content 详情页与 AI 调试入口
