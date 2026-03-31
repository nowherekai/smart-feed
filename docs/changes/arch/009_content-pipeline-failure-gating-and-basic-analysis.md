---
type: arch
number: "009"
date: 2026-03-31
title: Content Pipeline 通用失败阻断与基础分析最小闭环
tags: [backend, pipeline, tracking, ai, openrouter, bullmq]
related: ["arch/008"]
---

# arch/009 Content Pipeline 通用失败阻断与基础分析最小闭环

## 背景与动机

`Task 3` 与 `Task 4` 完成后，`content.fetch-html` 和 `content.normalize` 已有真实业务逻辑，但“是否继续下一步”的决定仍散在服务层内部，导致失败治理不一致：

- `content.fetch-html` 在服务层内部直接 enqueue `content.normalize`
- `content.normalize` 在服务层内部直接 enqueue `content.analyze.basic`
- `content.analyze.basic` 仍是 placeholder，AI disabled / 配置缺失 / OpenRouter 调用失败还没有真正落到 pipeline 行为上

这会让“AI 未配置时阻断后续分析链路”变成特例修补，而不是通用规则。

因此本次调整把 content 链路收敛到统一的 step result + runtime 模型：**任一步失败都不再推进下一步，但仅影响当前 content 对象，不影响其它 source/content job。**

## 技术选型

| 方案 | 优点 | 代价 |
|------|------|------|
| 服务层内部继续 `if/else + enqueue` | 改动最少 | 失败治理继续分散，tracking 也无法统一 |
| handler/runtime 统一决定下一步 | 失败阻断、tracking、续跑控制都能收口 | 需要新增 step result 协议与 runtime |
| AI 未配置单独在 `content.analyze.basic` 特判 | 实现快 | 只解决 AI，一个 HTML/normalize 失败模型仍然分散 |

最终选择：**为 content 链路新增统一步骤结果协议与 pipeline runtime，并把 next-step enqueue 从服务层移动到 handler/runtime。AI disabled / provider 缺失 / OpenRouter 配置错误都落入同一套 failure gating 规则。**

## 架构设计

- `src/pipeline/types.ts`
  - 定义 `PipelineStepOutcome`、`PipelineStepResult`、`PipelineStepExecutionResult`
  - 显式表达 `completed` / `completed_with_fallback` / `failed`
- `src/services/pipeline-runtime.ts`
  - 统一创建/更新 `pipeline_runs` 与 `step_runs`
  - 统一序列化输入/输出引用
  - 仅当 step result 允许时才 enqueue 下一步
  - 失败时直接把当前 content pipeline 标记为 `failed`
- `src/services/content.ts`
  - `runContentFetchHtml()` 与 `runContentNormalize()` 只做当前步业务
  - 返回结构化结果，不再在服务层直接 enqueue
- `src/services/analysis.ts`
  - 新增 `runContentAnalyzeBasic()`
  - 在 `disabled | openrouter misconfigured | AI call failed` 时返回 `failed`
  - 最小落库 `analysis_records` basic 结果，并把 `content_items.status` 更新为 `analyzed`
- `src/pipeline/handlers/content-*.ts`
  - 三个 content handler 全部改为走统一 runtime
  - `pipelineRunId` 在 `content.fetch-html -> content.normalize -> content.analyze.basic` 间透传，形成单 content 生命周期的统一 run

## 关键行为

- `content.fetch-html`
  - 抓取成功：`completed`，继续到 `content.normalize`
  - 抓取失败但 RSS 原始内容可用：`completed_with_fallback`，继续到 `content.normalize`
  - 抓取失败且无 fallback：`failed`，不再续跑
- `content.normalize`
  - 标准化成功：`completed`，继续到 `content.analyze.basic`
  - 标准化失败：`failed`，不再续跑
- `content.analyze.basic`
  - provider disabled / 未配置 / OpenRouter 配置错误 / API 失败：`failed`，不再续跑
  - 分析成功：写入 basic `analysis_records`，更新 `content_items.status = analyzed`
  - 由于 `content.analyze.heavy` 仍是 placeholder，本轮即使 `valueScore > threshold` 也只记录阈值判断，不再 enqueue heavy

## 相关文件

- `src/pipeline/types.ts` — 统一步骤结果协议
- `src/services/pipeline-runtime.ts` — content pipeline runtime 与 tracking 收口
- `src/services/content.ts` — `fetch-html` / `normalize` 服务层去 enqueue
- `src/services/analysis.ts` — `content.analyze.basic` 最小真实服务
- `src/pipeline/handlers/content-fetch-html.ts` — 统一 runtime 接入
- `src/pipeline/handlers/content-normalize.ts` — 统一 runtime 接入
- `src/pipeline/handlers/content-analyze-basic.ts` — 新的真实 handler
- `src/pipeline/handlers/index.ts` — 替换 `content.analyze.basic` placeholder
- `src/services/pipeline-runtime.test.ts` — runtime success / fallback / failed 覆盖
- `src/services/content.test.ts` — `fetch-html` / `normalize` success / fallback / failed 覆盖
- `src/services/analysis.test.ts` — AI disabled / 配置失败 / 成功落库覆盖

## 相关变更记录

- `arch/008` — Task 4 AI 适配层与显式 Provider 启用
