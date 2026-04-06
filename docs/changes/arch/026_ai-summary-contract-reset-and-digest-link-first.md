---
type: arch
number: "026"
date: 2026-04-06
title: AI 摘要契约重构与 Digest 回链优先
tags: [backend, ai, digest, database, docs]
related: ["arch/010", "arch/011", "arch/025"]
---

# arch/026 AI 摘要契约重构与 Digest 回链优先

## 背景与动机

当前仓库仍沿用第一版 AI 摘要契约：

- basic 分析包含 `sentiment`
- heavy 摘要包含 `oneline`、`points`、`reason`、`evidence_snippet`
- digest 准入依赖 traceability 校验与 `rejected` 状态

这套结构已经不符合现阶段产品方向。当前目标改为：

- basic 只保留分类、关键词、实体、语种和价值分
- heavy 统一输出 `summary + paragraphSummaries`
- digest 只要求可渲染摘要、来源名称和原文链接

由于项目仍处于开发阶段，本次直接重置数据库 migration 基线，不保留旧字段兼容层。

## 技术选型

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| 保留旧契约并做双写兼容 | 对旧数据最安全 | 代码和测试复杂度高，继续背负过渡结构 | 不采用 |
| 新增 v2 契约并并存维护 | 版本边界清晰 | 当前开发期收益低，缓存和测试都要双份维护 | 不采用 |
| 直接重置为新契约 | 结构最干净，落地最快 | 需要重生 migration 与测试基线 | 采用 |

## 数据模型

- `BasicAnalysis`
  - 删除 `sentiment`
  - 保留 `categories`、`keywords`、`entities`、`language`、`valueScore`
- `HeavySummary`
  - 改为 `{ summary: string; paragraphSummaries: string[] }`
- `analysis_records`
  - 删除 `sentiment`、`evidence_snippet`
  - `summary` JSON 改为新结构
  - `status` 收敛为 `basic | full`

## 架构设计

- `src/ai/*`
  - 沿用 `basic-analysis-v1` / `heavy-summary-v1`
  - 直接切换 schema、prompt、dummy provider 和 repair normalizer 到新结构
- `src/services/analysis.ts`
  - basic 不再写 `sentiment`
  - heavy 成功即写入 `status = full`
  - 删除 traceability 校验与 `rejected` 分支
- `src/services/digest.ts` / `src/services/digest-renderer.ts`
  - digest 选择只要求可渲染摘要、来源名称和原文链接
  - Markdown 与前端统一围绕 `summary + paragraphSummaries` 展示
- `src/app/original-content/*` 与 intelligence 组件
  - 去除证据片段展示
  - 用整体摘要作为主文案，段落摘要作为补充列表
- `spec/` 与 `.42cog/`
  - 将“可追溯”更新为“原文回链阅读”
  - 同步新的摘要结构与 digest 准入规则

## 相关文件

- `src/ai/` — AI 契约、prompt、provider、repair
- `src/services/analysis.ts` — 分析写库与 heavy 状态收口
- `src/services/digest.ts` — digest 选择与渲染输入
- `src/db/schema.ts` — 数据模型与枚举调整
- `spec/pm/pr.spec.md` — 产品需求规格
- `spec/dev/sys.spec.md` — 系统架构规格

## 相关变更记录

- `arch/010` — Content Heavy Analysis 接入统一 Runtime 与可追溯落库
- `arch/011` — Digest Compose 接入统一 Runtime 与原子化持久化
- `arch/025` — AI Client 模块化拆分与职责分离
