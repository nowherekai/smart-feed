---
type: arch
number: "008"
date: 2026-03-31
title: Task 4 AI 适配层与显式 Provider 启用
tags: [backend, ai, openrouter, dummy, vercel-ai-sdk]
related: ["arch/007"]
---

# arch/008 Task 4 AI 适配层与显式 Provider 启用

## 背景与动机

`Task 3` 已经把内容标准化为 `cleaned_md`，但 AI 侧仍然没有统一调用入口、Prompt 注册表和结构化输出校验。与此同时，本项目第一版并不直接接 Anthropic，而是通过 OpenRouter 接入模型；本地未配置 API 能力时，也不能因为 AI 缺失而阻断 RSS 抓取、HTML 抓取和标准化这些前置流程。

因此 `Task 4` 需要解决三个明确问题：

- 用统一适配层屏蔽具体模型网关，先落到 OpenRouter
- 明确 `provider 未配置`、`provider=openrouter`、`provider=dummy` 三种运行态
- 为 `Task 5` 提前固定 Prompt 版本、模型策略与 Zod Schema，避免后续分析链路再返工

## 技术选型

| 方案 | 优点 | 代价 |
|------|------|------|
| `ai` + `@ai-sdk/openai` + OpenAI-compatible provider | 保持 Vercel AI SDK 抽象，初版直接接 OpenRouter，后续切兼容网关只改 env 和 provider 工厂 | 需要在本地显式维护 provider 配置 |
| 直接绑 Anthropic provider | 接 Claude 最直接 | 与当前 OpenRouter 约束不符，后续迁移成本更高 |
| 默认回退到 dummy | 本地最省事 | 会掩盖 AI 未配置状态，不符合“必须显式启用 dummy”的约束 |

最终选择：**使用 Vercel AI SDK + `@ai-sdk/openai`，通过 OpenAI-compatible provider 默认对接 OpenRouter；`dummy` 仅在显式配置时启用，未配置 provider 时直接把 AI runtime 标记为 `disabled`。**

## 架构设计

- `src/config/env.ts`
  - 新增 `SMART_FEED_AI_PROVIDER`、`OPENROUTER_API_KEY`、`OPENROUTER_BASE_URL`、`SMART_FEED_AI_BASIC_MODEL`、`SMART_FEED_AI_HEAVY_MODEL`
  - `SMART_FEED_AI_PROVIDER` 允许 `openrouter | dummy`，未配置时返回 `null`
- `src/ai/prompts.ts`
  - 固定注册 `basic-analysis-v1` 与 `heavy-summary-v1`
  - Prompt 定义包含 `promptVersion`、`schema`、`buildMessages(input)` 和 provider-aware 的 `modelStrategy`
- `src/ai/schemas.ts`
  - 定义 `BasicAnalysisSchema` 与 `HeavySummarySchema`
  - 所有 dummy / OpenRouter 输出都必须经过同一份 Zod 校验
- `src/ai/client.ts`
  - 提供 `getAiRuntimeState()`、`assertAiAvailable()`、`resolveAiTaskConfig()`
  - 提供 `runBasicAnalysis()`、`runHeavySummary()`
  - `provider=openrouter` 时使用 OpenRouter 客户端组装
  - `provider=dummy` 时返回确定性假数据
  - `provider` 未配置时抛 `AiProviderUnavailableError`，把 AI 阶段显式阻断给后续 Task 5 处理

## 相关文件

- `src/config/env.ts` — AI provider 环境变量解析
- `src/ai/client.ts` — AI runtime、provider 工厂与统一调用入口
- `src/ai/prompts.ts` — Prompt 注册表
- `src/ai/schemas.ts` — Zod 输出 schema
- `src/ai/client.test.ts` — disabled/dummy/openrouter 三态测试
- `src/ai/prompts.test.ts` — Prompt 映射与上下文拼装测试
- `docs/plan/backend-implementation-plan.md` — Task 4 文档修正与完成状态

## 相关变更记录

- `arch/007` — Task 3 HTML 抓取与 Markdown 标准化
