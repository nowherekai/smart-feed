---
type: arch
number: "025"
date: 2026-04-04
title: AI Client 模块化拆分与职责分离
tags: [ai, refactor, provider, testing]
related: ["arch/008", "arch/023", "arch/024"]
---

# arch/025 AI Client 模块化拆分与职责分离

## 背景与动机

`src/ai/client.ts` 原先同时承载了运行时配置解析、错误定义、结构化输出修复、Dummy 启发式实现、OpenRouter SDK 调用、客户端工厂和门面导出，单文件复杂度已经明显偏高。

这带来三个直接问题：

- repair、dummy、openrouter 三类逻辑彼此交织，阅读和修改时需要频繁跨段跳转
- Provider 无关的纯函数无法形成独立模块边界，测试颗粒度不清晰
- SDK 调用细节和客户端路由耦合在一起，不利于保留公共 API 的前提下继续演进

因此本次调整的目标不是新增 Provider 扩展框架，而是在不改变现有对外接口的前提下，把 AI Client 拆成职责清晰的模块。

## 技术选型

| 方案 | 优点 | 代价 |
|------|------|------|
| 保持单文件，仅按注释分区 | 改动最小 | 复杂度不降，测试边界仍然模糊 |
| 直接做可插拔 Provider 注册机制 | 扩展性强 | 会牵涉 `config/env.ts`、`prompts.ts` 和 modelStrategy 设计，超出本次范围 |
| 先按职责拆分模块，保留现有公共 API | 风险可控，复杂度显著下降，兼容现有测试与下游调用 | 新增多个内部文件，需要重新梳理导出边界 |

最终选择：

- 保持 `createAiClient`、`AiClientDeps`、门面函数和 `index.ts` 公共 API 不变
- 新增 `types.ts`、`errors.ts`、`provider.ts` 收敛共享边界
- 将结构化修复逻辑拆到 `repair/`
- 将 Dummy 与 OpenRouter 实现拆到 `providers/`
- 保留 `client.ts` 作为唯一任务配置真相源和调度入口

## 架构设计

- `src/ai/client.ts`
  - 仅保留运行时解析、任务配置解析、Provider 路由、单例门面和入口日志
  - `resolveTaskConfig` 继续作为模型配置和 `modelStrategy` 的唯一真相源
- `src/ai/repair/`
  - `json-parser.ts` 负责提取和解析 JSON 文本候选
  - `normalizers.ts` 负责语言、情绪、价值分和结构化对象归一化
  - `index.ts` 暴露 `tryRepairStructuredObjectText`
- `src/ai/providers/dummy.ts`
  - 负责启发式模拟输出
  - 通过 `schemaName` 做运行时守卫，限制仅支持当前两种 schema
- `src/ai/providers/openrouter.ts`
  - 负责 OpenRouter provider 初始化缓存、SDK 调用和错误日志
  - 清理旧实现中无效的 repair 死代码
- 日志保持兼容
  - 所有模块继续使用 `createLogger("AiClient")`
  - provider 身份通过 context 字段记录，避免影响现有日志检索

## 相关文件

- `src/ai/client.ts` — 瘦客户端与任务配置解析
- `src/ai/types.ts` — AI 共享类型
- `src/ai/errors.ts` — AI 错误定义
- `src/ai/provider.ts` — Provider 接口
- `src/ai/repair/*.ts` — 结构化输出修复逻辑
- `src/ai/providers/*.ts` — Dummy / OpenRouter 实现
- `src/ai/client.test.ts` — AI 客户端回归测试
- `src/ai/repair/normalizers.test.ts` — repair 纯函数补充测试

## 相关变更记录

- `arch/008` — Task 4 AI 适配层与显式 Provider 启用
- `arch/023` — 服务层结构化日志增强与日志边界收敛
- `arch/024` — 后端组件化日志格式统一
