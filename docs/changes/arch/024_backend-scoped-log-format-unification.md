---
type: arch
number: "024"
date: 2026-04-02
title: 后端组件化日志格式统一
tags: [backend, logging, observability, worker]
related: ["arch/017", "arch/023"]
---

# arch/024 后端组件化日志格式统一

## 背景与动机

当前后端虽然已经有统一的 `src/utils/logger.ts` 出口，但输出仍是单行 JSON，且多个模块继续把 `[worker]`、`[handler]`、`[services/content]` 这类前缀硬编码在 message 中。

这会带来两个问题：

- 终端排查时，人需要先读 JSON 再识别模块，扫描效率偏低
- 模块语义混在 message 内，难以稳定形成统一的日志规范

因此本次调整把日志统一收敛为带时间、级别、组件名的单行文本格式，同时保持现有业务上下文字段继续通过结构化 JSON 尾部输出。

## 技术选型

| 方案 | 优点 | 代价 |
|------|------|------|
| 在现有轻量 logger 上新增 `createLogger(component)` | 改动集中、迁移成本低、不引入新依赖 | 需要逐个模块替换默认 logger |
| 引入完整日志库（如 pino / winston） | 功能更强 | 超出本次“仅统一规范”的范围 |
| 继续保留 message 前缀约定 | 改动最小 | 组件语义仍不稳定，格式无法彻底统一 |

最终选择：

- 保留现有轻量日志封装
- 新增 `createLogger(component)` 工厂
- 将 worker / services / handlers 的模块前缀迁移为组件名
- 保持 `debug` 生产环境默认关闭

## 架构设计

- `src/utils/logger.ts`
  - 新增 `createLogger(component)`
  - 统一输出格式为 `[ISO时间] [LEVEL] [Component] message {json-context}`
  - 空 context 不追加尾部 JSON
- `src/workers/*.ts`
  - 使用 `WorkerMain`、`WorkerBullBoard` 组件名替代 `[worker]` 前缀
- `src/services/*.ts`
  - 使用 `ContentService`、`AnalysisService`、`PipelineRuntime` 等组件名收敛日志来源
- `src/pipeline/handlers/*.ts`
  - 使用 `HandlerSourceFetch`、`HandlerContentAnalyzeBasic` 等组件名表达处理器身份
- 错误抛出语义保持不变
  - 仅拆分“日志文案”和“throw message”复用的场景，避免影响现有业务判断和测试断言

## 相关文件

- `src/utils/logger.ts` — 日志工厂与输出格式
- `src/workers/index.ts` — Worker 主入口组件日志
- `src/workers/bull-board.ts` — Bull Board 组件日志
- `src/services/*.ts` — Service / Runtime 组件日志
- `src/pipeline/handlers/*.ts` — Handler 组件日志

## 相关变更记录

- `arch/017` — Worker 独立端口 bull-board 队列监控
- `arch/023` — 服务层结构化日志增强与日志边界收敛
