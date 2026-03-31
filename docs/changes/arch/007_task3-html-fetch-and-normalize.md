---
type: arch
number: "007"
date: 2026-03-31
title: Task 3 HTML 抓取与 Markdown 标准化
tags: [backend, pipeline, html, markdown, normalization]
related: ["arch/006"]
---

# arch/007 Task 3 HTML 抓取与 Markdown 标准化

## 背景与动机

`Task 2` 已经能够把 RSS/Atom 条目写入 `content_items` 与 `content_item_raws`，但 `content.fetch-html` 和 `content.normalize` 仍然是占位符。没有这两步，系统只能停留在 feed 原始内容层，既无法补全文页面正文，也无法为后续 AI 分析提供统一的 Markdown 输入。

同时，当前规格对原始层有两个关键约束需要在实现中落地：

- 原始层和加工层必须分离
- 原始层内部允许全文抓取覆盖 `raw_body`，但 feed 初始摘要必须通过 `raw_excerpt` 保留

## 技术选型

| 方案 | 优点 | 代价 |
|------|------|------|
| `fetch` + `linkedom` + `turndown` | 依赖较轻，既能抓 HTML，又能做 DOM 去噪和 Markdown 转换，适合当前 Bun worker | 正文抽取仍是启发式规则，不是完整 Readability |
| 引入更重的正文提取器（如 Readability 生态） | 正文识别更强 | 依赖更重，当前 MVP 容易把 `Task 3` 扩大成内容提取专项工程 |

最终选择：**用服务层显式抓取 HTML，用 `linkedom` 做最小 DOM 清理与正文选择，再用 `turndown` 输出 Markdown**。先保证链路闭环和数据分层正确，正文抽取精度后续再迭代。

## 架构设计

- `src/services/html-fetcher.ts`
  - 负责页面 HTML 抓取
  - 对新发现文章优先抓取原始页面 HTML
  - 抓取失败时保留 RSS 原始内容作为后续标准化回退
  - 在需要抓全文时保留原始 feed 内容到 `raw_excerpt`
- `src/services/normalizer.ts`
  - 负责 HTML 去噪、正文节点选择、HTML/Text -> Markdown 转换
  - 限制输出最大 50KB，避免后续分析输入失控
- `src/services/content.ts`
  - 编排 `content.fetch-html` 与 `content.normalize`
  - `content.fetch-html` 成功时更新 `content_item_raws.raw_body`，失败但仍有 feed 内容时降级继续
  - `content.normalize` 把 Markdown 写入 `content_items.cleaned_md`，并更新状态为 `normalized`
- `src/pipeline/handlers/content-fetch-html.ts`
  - 把 `content.fetch-html` 从 placeholder 替换为真实 handler
- `src/pipeline/handlers/content-normalize.ts`
  - 把 `content.normalize` 从 placeholder 替换为真实 handler

## 相关文件

- `src/services/html-fetcher.ts` — HTML 抓取与回退工具
- `src/services/normalizer.ts` — 去噪与 Markdown 标准化
- `src/services/content.ts` — Task 3 编排逻辑
- `src/pipeline/handlers/content-fetch-html.ts` — `content.fetch-html` handler
- `src/pipeline/handlers/content-normalize.ts` — `content.normalize` handler
- `src/services/content.test.ts` — Task 3 服务层测试
- `src/services/html-fetcher.test.ts` — HTML 抓取与回退测试
- `src/services/normalizer.test.ts` — 标准化测试
- `docs/plan/backend-implementation-plan.md` — Task 3 完成状态更新

## 相关变更记录

- `arch/006` — Task 2 RSS 抓取与内容入库
