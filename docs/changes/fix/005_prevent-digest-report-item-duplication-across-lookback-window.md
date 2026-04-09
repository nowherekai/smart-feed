---
type: fix
number: "005"
date: 2026-04-09
title: 修复 Digest Report 跨窗口重复收录
tags: [digest, backend, scheduler]
related: ["arch/011", "arch/012"]
---

# fix/005 修复 Digest Report 跨窗口重复收录

## 事件概述
- 发现时间：2026-04-09
- 影响范围：`digest.compose` 生成的 `digest_reports` / `digest_items`
- 严重程度：中

## 时间线
- 2026-04-09 复查 `digest_reports` 时发现相邻两天的 report 出现重复内容。
- 2026-04-09 确认 `digest.compose` 的 lookback 窗口不是固定 24 小时，而是允许在前一日报失败时顺延补齐。
- 2026-04-09 确认当前 compose 查询只按时间窗口取数，没有排除“已经进入其他 report 的内容”。

## 根因分析
直接原因是 `digest.compose` 只根据 `windowStart/windowEnd` 选择候选分析记录，窗口跨天重叠时，同一内容会再次落入后续 report。

根本原因是早期设计只保证了单个 report 内部按 `contentId` 去重，没有把“一个内容一旦进入某个 report，就不能进入另一个 report”建模为 compose 期约束。

## 修复方案
### 临时修复
在 compose 前查询已被其他 `digest_items` 消费过的 `contentId` 集合，并在候选选择阶段直接排除这些内容。

### 根本修复
- 保留现有 lookback 机制，继续支持某天 report 失败后由后续窗口顺延补齐。
- 对“当前正在重跑的同一份 draft report”保留复用能力，只排除其他 report 已消费的内容。
- 增加结构化日志，明确记录 `consumedContentCount` 与 `skippedConsumedCount`。
- 补充单测，覆盖“跨 report 排除重复内容”和“重跑当前 draft report 不误伤自身条目”。

## 预防措施
- [ ] 后续若需要更强约束，再评估为 `digest_items` 增加跨 report 的数据库级唯一性，并先清理历史重复数据。
- [ ] 为 digest 生成链路增加更贴近真实数据库状态的集成测试，覆盖 lookback 重叠窗口场景。
