---
type: arch
number: "010"
date: 2026-03-31
title: Content Heavy Analysis 接入统一 Runtime 与可追溯落库
tags: [backend, pipeline, ai, runtime, traceability, digest]
related: ["arch/009"]
---

# arch/010 Content Heavy Analysis 接入统一 Runtime 与可追溯落库

## 背景与动机

在 `arch/009` 完成 content 链路的统一 failure gating 后，`content.analyze.basic` 已经可以按统一 runtime 执行，但高价值内容仍停在 basic 阶段，无法形成真正的 `basic -> heavy` 链路，也无法为后续 digest 预留 `full / rejected` 分析记录。

因此本次补齐的重点是：

- 让 `content.analyze.basic` 在高价值内容上真正推进到 `content.analyze.heavy`
- 让 `content.analyze.heavy` 也走统一 runtime / tracking / failure gating
- 为 digest 准备最小可追溯的 `analysis_records.status = full | rejected`

## 架构设计

- `src/services/analysis.ts`
  - 扩展 `runContentAnalyzeBasic()`：按 `value_score` 决定是否 enqueue `content.analyze.heavy`
  - 新增 `runContentAnalyzeHeavy()`：
    - 读取内容与 latest basic 记录
    - 调用 `runHeavySummary()`
    - 校验证据片段，不命中正文时降级为 `cleaned_md` 前 200 字
    - 写入新的 heavy `analysis_record`
    - 根据 traceability 完整性标记 `full | rejected`
- `src/services/traceability.ts`
  - 新增 `canEnterDigest()`
  - 统一判断 `sourceTraceId`、`sourceName`、`contentTraceId`、`originalUrl`、`evidenceSnippet` 是否齐全
- `src/pipeline/handlers/content-analyze-heavy.ts`
  - 通过统一 runtime 执行 heavy step
  - 失败时阻断当前 content pipeline，成功时结束 pipeline

## 关键行为

- `content.analyze.basic`
  - 命中缓存时仍按阈值决定是否推进 heavy
  - `value_score <= threshold` 时直接结束 pipeline
  - `value_score > threshold` 时 enqueue `content.analyze.heavy`
- `content.analyze.heavy`
  - AI disabled / 配置缺失 / OpenRouter 调用失败：`failed`
  - 缺少 basic 记录：`failed`
  - 成功时写入 `analysis_records.status = full | rejected`
  - 完成后更新 `content_items.status = analyzed`

## 相关文件

- `src/services/analysis.ts` — basic/heavy 一体化分析服务
- `src/services/traceability.ts` — digest 准入判断
- `src/pipeline/handlers/content-analyze-heavy.ts` — heavy handler
- `src/pipeline/handlers/index.ts` — heavy handler 接线
- `src/services/analysis.test.ts` — basic/heavy 业务测试
- `src/pipeline/handlers/content-analyze-heavy.test.ts` — heavy runtime 测试

## 相关变更记录

- `arch/009` — Content Pipeline 通用失败阻断与基础分析最小闭环
