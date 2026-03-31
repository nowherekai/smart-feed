---
type: arch
number: "012"
date: 2026-03-31
title: Digest Delivery 可配置 SMTP 投递与 Runtime 交接
tags: [backend, pipeline, digest, email, smtp, runtime]
related: ["arch/011"]
---

# arch/012 Digest Delivery 可配置 SMTP 投递与 Runtime 交接

## 背景与动机

在 `arch/011` 完成 `digest.compose` 后，系统已经能生成并持久化日报，但 `digest.deliver` 仍是占位实现，Digest pipeline 实际上还没有形成完整闭环。

同时，邮件投递存在两个直接约束：

- 开发和测试环境不应默认要求 SMTP 配置
- 一旦启用投递，Digest pipeline 需要恢复为标准的 `compose -> deliver` 两步执行与收尾模型

因此本次变更的目标是：

- 将 `digest.deliver` 落地为真实后端投递链路
- 引入显式邮件开关，默认关闭，不因未配置 SMTP 破坏系统运行
- 在开启邮件投递后，通过 SMTP 发送 HTML + 纯文本日报
- 让 Digest pipeline run 从“compose 临时收尾”回到“deliver 收尾”的正常语义

## 技术选型

| 方案 | 优点 | 代价 |
|------|------|------|
| 默认强制 SMTP 配置 | 配置面简单 | 本地开发、测试环境成本高，未启用投递时也会破坏启动 |
| 显式布尔开关控制邮件投递 | 默认安全，环境差异清晰 | 多一个配置项，需要定义 disabled 时的状态语义 |
| 使用 `marked` + `nodemailer` | Markdown 渲染和 SMTP 发送成熟稳定 | 增加两项后端依赖 |

最终选择：

- **新增 `SMART_FEED_EMAIL_DELIVERY_ENABLED`，默认 `false`**
- **使用 `marked` 渲染邮件 HTML**
- **使用 `nodemailer` 执行 SMTP 投递**
- **Digest pipeline 复用同一 `pipelineRunId`，由 `digest.deliver` 负责最终收尾**

## 架构设计

- `src/config/env.ts`
  - 新增 `emailDeliveryEnabled`
  - 仅当显式开启邮件投递时，才要求 `SMTP_HOST/PORT/USER/PASS/FROM/TO` 完整配置
- `src/services/email.ts`
  - 将 `markdown_body` 转成 HTML 邮件正文
  - 统一封装 SMTP 发送
- `src/services/digest-delivery.ts`
  - 读取 `digest_report`
  - 处理已发送幂等、disabled skip、SMTP 发送成功、失败重试等分支
  - 发送成功更新 `status=sent` 与 `sent_at`
  - 配置错误或发送失败时更新 `status=failed` 并抛错，让队列重试
- `src/services/digest-pipeline-runtime.ts`
  - 当 `digest.compose` 产生 `nextStep` 时保持 pipeline run 为 `running`
  - `digest.deliver` 复用同一 `pipelineRunId`
  - 由 `digest.deliver` 在完成或失败时收尾 pipeline run
- `src/pipeline/handlers/digest-deliver.ts`
  - 新增真实 delivery handler
- `src/pipeline/handlers/index.ts`
  - 将 `digest.deliver` 从 placeholder 切换为真实 handler

## 关键行为

- 默认关闭：
  - `SMART_FEED_EMAIL_DELIVERY_ENABLED=false`
  - `digest.deliver` 跳过发送，不报错
  - `digest_report.status` 保持 `ready`
  - pipeline run 视为成功完成
- 显式开启：
  - 要求 SMTP 配置完整
  - 成功发送后写入 `sent/sent_at`
  - 配置错误或发送失败时写入 `failed` 并抛错重试
- 幂等语义：
  - 已 `sent` 的 digest 再次执行时直接跳过，不重复发信

## 相关文件

- `src/config/env.ts` — 邮件投递开关与 SMTP 配置校验
- `src/services/email.ts` — Markdown 邮件渲染与 SMTP 发送
- `src/services/digest-delivery.ts` — Digest 投递服务
- `src/services/digest-pipeline-runtime.ts` — digest runtime 多步交接
- `src/pipeline/handlers/digest-deliver.ts` — delivery handler
- `src/pipeline/handlers/index.ts` — delivery handler 接线
- `src/config/env.test.ts` — env 配置测试
- `src/services/email.test.ts` — 邮件服务测试
- `src/services/digest-delivery.test.ts` — delivery 服务测试
- `src/pipeline/handlers/digest-deliver.test.ts` — delivery handler/runtime 测试
- `docs/plan/backend-implementation-plan.md` — Task 7 完成状态

## 相关变更记录

- `arch/011` — Digest Compose 接入统一 Runtime 与原子化持久化
