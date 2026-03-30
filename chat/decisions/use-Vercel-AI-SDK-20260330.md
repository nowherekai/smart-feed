针对 Node.js 后端开发，目前在 TypeScript 生态中最推荐的 3 个 AI SDK 框架。它们都能帮助你通过统一的接口接入不同的 LLM API（如 OpenAI, Claude, Gemini, Llama 等）。

---

## 1. Vercel AI SDK (首选推荐)
虽然名字带有 "Vercel"，但它是**框架无关**的，在纯 Node.js 后端（如 Express, Fastify, NestJS）中表现极其出色。它是目前 TS 生态中性能最强、代码最简洁的选择。

* **特点**：
    * **统一接口**：使用 `generateText` 或 `streamText` 配合不同的 `provider` 即可切换模型。
    * **强类型**：对结构化输出（Structured Outputs）支持极好，配合 **Zod** 可以直接得到带类型的 JSON 对象。
    * **轻量化**：相比 LangChain，它的抽象层非常薄，学习曲线平缓。
    * **工具调用**：内置了非常直观的 `tools` 定义方式。
* **适用场景**：需要快速接入多种模型、重视类型安全、追求高性能流式传输的后端项目。

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai'; // 或 anthropic, google

const { text } = await generateText({
  model: openai('gpt-4o'),
  prompt: '你好，请自我介绍',
});
```

---

## 2. LangChain.js
AI 开发领域的“瑞士军刀”，功能最全，但也最重。

* **特点**：
    * **生态庞大**：除了接入 LLM，还内置了海量的向量数据库、文档加载器、缓存等插件。
    * **LangGraph**：如果你需要构建复杂的**多步工作流**或**智能体（Agent）**，LangGraph 是目前最成熟的方案。
    * **组件化**：所有的 Prompt、Chain、Output Parser 都是模块化的。
* **适用场景**：复杂的企业级应用、需要构建 RAG（检索增强生成）系统、或者需要高度定制化的 Agent 逻辑。

---

## 3. Mastra (2025-2026 新兴黑马)
Mastra 是专为 **TypeScript 后端** 设计的生产级框架，旨在解决 LangChain 太重而 Vercel AI SDK 逻辑处理较薄的问题。

* **特点**：
    * **内置可观测性**：自带日志和追踪（Tracing），非常适合生产环境调试。
    * **Workflow 引擎**：比 LangGraph 更容易上手的有向无环图（DAG）工作流定义。
    * **本地开发优先**：提供了非常好用的开发工具，可以可视化预览 Agent 的决策过程。
* **适用场景**：需要构建复杂的后端 AI 服务，且对生产监控、调试有较高要求的团队。

---

## 核心对比表

| 特性 | Vercel AI SDK | LangChain.js | Mastra |
| :--- | :--- | :--- | :--- |
| **学习曲线** | 极低（非常直观） | 较高（抽象概念多） | 中等 |
| **包体积** | 极轻量 | 较重 | 中等 |
| **多模型切换** | 极其简单 (Provider 模式) | 简单 (接口统一) | 简单 |
| **复杂逻辑处理** | 一般 | 极强 (LangGraph) | 强 (Workflows) |
| **主要优势** | 类型安全、简洁、高效 | 插件生态最丰富 | 生产级监控、开发体验好 |

---

### 💡 建议
* 如果你只是想**简单、快速地接入**几个不同的 API 并在后端处理数据，请直接选 **Vercel AI SDK**。
* 如果你正在构建一个**复杂的智能体系统**（需要记忆、长流程循环、大量第三方工具集成），请选择 **LangChain.js**。
* 如果你在寻找**更现代的后端架构**，且希望框架自带调试和监控功能，可以尝试 **Mastra**。

**你想先深入了解其中哪一个框架的具体接入代码，或者需要我帮你对比某个特定功能（如结构化输出或工具调用）吗？**
