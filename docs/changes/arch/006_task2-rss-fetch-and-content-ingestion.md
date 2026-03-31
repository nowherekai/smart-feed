---
type: arch
number: "006"
date: 2026-03-31
title: Task 2 RSS 抓取与内容入库
tags: [backend, pipeline, rss, content, sync-cursor]
related: ["arch/005"]
---

# arch/006 Task 2 RSS 抓取与内容入库

## 背景与动机

`Task 1` 已经让系统能够导入单个 RSS 源和 OPML 清单，但 `source.fetch` 仍然是占位符，来源虽然可配置，却还无法真正进入内容池和后续 pipeline。为了支撑后续 HTML 抓取、标准化和 AI 分析，必须先补齐 RSS/Atom 抓取、条件请求、三级去重、时间窗口过滤和原始层入库。

## 技术选型

| 方案 | 优点 | 代价 |
|------|------|------|
| `fetch` + `rss-parser.parseString()` | 同时拿到 HTTP 响应头、304 状态和 feed 解析结果，适合维护 `syncCursor` | 需要自己维护条件请求头和错误分支 |
| 直接用 `rss-parser.parseURL()` | 代码更短 | 不适合承接 `etag` / `last-modified` / 304 / 自定义请求头 |

最终选择：**HTTP 请求由服务层控制，RSS/Atom XML 解析交给 `rss-parser`**。

## 架构设计

- `src/parsers/rss.ts`
  - 负责把 RSS/Atom XML 解析为统一内容条目结构
  - 统一抽取 `externalId`、URL、`publishedAt`、`rawBody`、`rawExcerpt`
- `src/services/content.ts`
  - 负责 `source.fetch` 的抓取、去重、入库、cursor 更新和后续入队
  - 304 时只更新同步状态，不写入内容
  - 200 时根据时间窗口把新条目写成 `raw` 或 `sentinel`
- `src/pipeline/handlers/source-fetch.ts`
  - 将 `source.fetch` 从 placeholder 替换为真实 handler

同时修正文档中的旧字段表述：`lastSyncedAt` 改为与 schema 一致的 `lastSuccessfulSyncAt`。

## 相关文件

- `src/parsers/rss.ts` — RSS/Atom 解析器
- `src/services/content.ts` — RSS 抓取、内容入库、cursor 更新
- `src/pipeline/handlers/source-fetch.ts` — `source.fetch` handler
- `src/parsers/rss.test.ts` — parser 测试
- `src/services/content.test.ts` — 内容抓取与入库测试
- `docs/plan/backend-implementation-plan.md` — Task 2 完成状态与字段口径修正

## 相关变更记录

- `arch/005` — Task 1 来源接入 Pipeline
