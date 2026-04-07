---
type: arch
number: "030"
date: 2026-04-07
title: Sources 页面全量 RSS OPML 导出
tags: [frontend, backend, sources, opml, export]
related: ["arch/020", "arch/023"]
---

# arch/030 Sources 页面全量 RSS OPML 导出

## 背景与动机

`/sources` 页面已经支持单条 RSS 添加和 OPML 批量导入，但用户仍无法把当前系统内的订阅源一次性导回阅读器或迁移到其他工具。由于导出是一个“立即下载文件”的动作，如果继续沿用 Server Action 返回字符串再由前端拼 Blob，会让客户端承担更多序列化和下载细节，也更容易基于过期首屏数据生成文件。

为了补齐来源管理闭环，需要提供一个由服务端实时查询最新 RSS 来源并直接返回附件的导出入口，同时保持导入/导出都围绕 OPML 这一通用格式展开。

## 技术选型

| 方案 | 优点 | 代价 |
|------|------|------|
| 新增 GET Route Handler 直接返回 OPML 附件 | 浏览器可直接下载，服务端实时查询最新数据，HTTP 头语义清晰 | 需要新增路由层和下载测试 |
| 复用 Server Action 返回 OPML 字符串，前端再构造下载 | 复用 action 调用方式，不新增路由 | 容易依赖首屏旧数据，客户端下载逻辑更重 |
| 前端直接从 `initialSources` 生成 OPML | 改动最少 | 页面数据可能过期，且把导出格式逻辑放进客户端不利于复用 |

最终选择：**新增 `/sources/export` GET 路由，由服务端查询全部 RSS 来源并直接返回 OPML 附件**。

## 架构设计

- `src/lib/opml-export.ts`
  - 新增纯函数 `buildSourcesOpml`
  - 输出扁平 OPML 2.0 文档
  - `text/title` 统一写 `source.title ?? source.identifier`
  - `xmlUrl` 写来源 `identifier`
  - `htmlUrl` 仅在 `siteUrl` 存在时输出
  - 对标题与 URL 做 XML 转义，保证下载文件可被标准 XML/OPML 解析
- `src/app/sources/export/route.ts`
  - 只查询 `rss-source`
  - 不按状态过滤，`active / paused / blocked` 全部导出
  - 按 `createdAt desc` 查询，保持和 Sources 列表一致的导出顺序
  - 设置 `Content-Disposition` 附件头，文件名为 `smart-feed-sources-YYYY-MM-DD.opml`
  - 使用结构化日志记录 `exportCount` 与错误摘要，不打印完整 URL 列表
- `src/app/sources/sources-client.tsx`
  - 在 `Manage Sources` 卡片头部增加“导出 OPML”按钮
  - 直接跳转 `/sources/export`，不改动现有 RSS 添加与 OPML 导入流程

## 相关文件

- `src/lib/opml-export.ts` — OPML 序列化器
- `src/lib/opml-export.test.ts` — 序列化器测试
- `src/app/sources/export/route.ts` — Sources OPML 导出下载路由
- `src/app/sources/export/route.test.ts` — 下载路由测试
- `src/app/sources/sources-client.tsx` — Sources 页面导出入口

## 相关变更记录

- `arch/020` — Sources 页面 OPML 导入入口与结果摘要
- `arch/023` — 服务层结构化日志增强与日志边界收敛
