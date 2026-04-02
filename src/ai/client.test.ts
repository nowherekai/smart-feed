import { expect, test } from "bun:test";
import type { ZodType } from "zod";
import {
  AiConfigurationError,
  AiProviderUnavailableError,
  createAiClient,
  resolveAiTaskConfig,
  tryRepairStructuredObjectText,
} from "./client";
import { BasicAnalysisSchema, HeavySummarySchema } from "./schemas";

const baseInput = {
  cleanedMd: "AI 平台发布了新的模型评测结果，并讨论了部署成本、架构约束和后续路线图。",
  originalUrl: "https://example.com/posts/ai",
  sourceName: "Example Feed",
  title: "AI 平台更新说明",
};

test("runtime state is disabled when provider is not configured", () => {
  const client = createAiClient({
    env: {
      aiBasicModel: null,
      aiHeavyModel: null,
      aiProvider: null,
      openRouterApiKey: null,
      openRouterBaseUrl: "https://openrouter.ai/api/v1",
    },
  });

  expect(client.getAiRuntimeState()).toBe("disabled");
  expect(() => client.assertAiAvailable()).toThrow(AiProviderUnavailableError);
  expect(
    resolveAiTaskConfig("basic", {
      aiBasicModel: null,
      aiHeavyModel: null,
      aiProvider: null,
      openRouterApiKey: null,
      openRouterBaseUrl: "https://openrouter.ai/api/v1",
    }),
  ).toEqual({
    baseURL: null,
    modelId: null,
    modelStrategy: null,
    promptVersion: "basic-analysis-v1",
    runtimeState: "disabled",
  });
});

test("dummy provider returns deterministic basic analysis and heavy summary", async () => {
  const client = createAiClient({
    env: {
      aiBasicModel: null,
      aiHeavyModel: null,
      aiProvider: "dummy",
      openRouterApiKey: null,
      openRouterBaseUrl: "https://openrouter.ai/api/v1",
    },
  });

  const basic = await client.runBasicAnalysis(baseInput);
  const heavy = await client.runHeavySummary(baseInput);

  expect(basic.language).toBe("zh");
  expect(basic.categories).toContain("ai");
  expect(basic.valueScore).toBeGreaterThanOrEqual(4);
  expect(basic.keywords.length).toBeGreaterThan(0);

  expect(heavy.oneline).toContain("AI 平台更新说明");
  expect(heavy.points.length).toBeGreaterThan(0);
  expect(heavy.reason).toContain("Dummy provider");
  expect(heavy.evidenceSnippet.length).toBeGreaterThan(0);
});

test("openrouter mode requires api key and model ids", async () => {
  const missingKeyClient = createAiClient({
    env: {
      aiBasicModel: "openai/gpt-4o-mini",
      aiHeavyModel: "openai/gpt-4o",
      aiProvider: "openrouter",
      openRouterApiKey: null,
      openRouterBaseUrl: "https://openrouter.ai/api/v1",
    },
  });

  await expect(missingKeyClient.runBasicAnalysis(baseInput)).rejects.toThrow(AiConfigurationError);

  const missingModelClient = createAiClient({
    env: {
      aiBasicModel: null,
      aiHeavyModel: "openai/gpt-4o",
      aiProvider: "openrouter",
      openRouterApiKey: "test-key",
      openRouterBaseUrl: "https://openrouter.ai/api/v1",
    },
  });

  await expect(missingModelClient.runBasicAnalysis(baseInput)).rejects.toThrow(
    "SMART_FEED_AI_PROVIDER=openrouter requires SMART_FEED_AI_BASIC_MODEL",
  );
});

test("openrouter mode assembles provider config and delegates structured generation", async () => {
  const providerCalls: Array<{ apiKey: string; baseURL: string; name: "openrouter" }> = [];
  const modelIds: string[] = [];

  const client = createAiClient({
    env: {
      aiBasicModel: "openai/gpt-4o-mini",
      aiHeavyModel: "openai/gpt-4o",
      aiProvider: "openrouter",
      openRouterApiKey: "test-key",
      openRouterBaseUrl: "https://openrouter.ai/api/v1",
    },
    generateStructuredObject: async <TOutput>(input: {
      model: unknown;
      prompt: string;
      schema: ZodType<TOutput>;
      schemaDescription: string;
      schemaName: string;
      system: string;
    }) => {
      const { model, prompt, schema, system } = input;
      const modelRecord = model as { modelId: string };
      modelIds.push(modelRecord.modelId);
      expect(system).toContain("smart-feed");
      expect(prompt).toContain("AI 平台更新说明");

      return {
        object: schema.parse({
          categories: ["ai"],
          entities: ["Example Feed"],
          keywords: ["ai", "platform"],
          language: "zh",
          sentiment: "neutral",
          valueScore: 8,
        }) as TOutput,
      };
    },
    openRouterProviderFactory: (config) => {
      providerCalls.push(config);

      return {
        chat(modelId: string) {
          return { modelId };
        },
      };
    },
  });

  const result = await client.runBasicAnalysis(baseInput);

  expect(providerCalls).toEqual([
    {
      apiKey: "test-key",
      baseURL: "https://openrouter.ai/api/v1",
      name: "openrouter",
    },
  ]);
  expect(modelIds).toEqual(["openai/gpt-4o-mini"]);
  expect(result.valueScore).toBe(8);
  expect(client.resolveAiTaskConfig("heavy")).toEqual({
    baseURL: "https://openrouter.ai/api/v1",
    modelId: "openai/gpt-4o",
    modelStrategy: "openrouter-heavy",
    promptVersion: "heavy-summary-v1",
    runtimeState: "openrouter",
  });
});

test("openrouter mode can generate heavy summary via injected structured generator", async () => {
  let providerFactoryCallCount = 0;
  const client = createAiClient({
    env: {
      aiBasicModel: "openai/gpt-4o-mini",
      aiHeavyModel: "openai/gpt-4o",
      aiProvider: "openrouter",
      openRouterApiKey: "test-key",
      openRouterBaseUrl: "https://openrouter.ai/api/v1",
    },
    generateStructuredObject: async <TOutput>(input: {
      model: unknown;
      prompt: string;
      schema: ZodType<TOutput>;
      schemaDescription: string;
      schemaName: string;
      system: string;
    }) => {
      const { schema } = input;

      if (input.schemaName === "basic_analysis") {
        return {
          object: schema.parse({
            categories: ["ai"],
            entities: ["Example Feed"],
            keywords: ["ai", "platform"],
            language: "zh",
            sentiment: "neutral",
            valueScore: 7,
          }) as TOutput,
        };
      }

      return {
        object: schema.parse({
          evidenceSnippet: "AI 平台发布了新的模型评测结果",
          oneline: "Example Feed：AI 平台更新说明",
          points: ["模型评测结果更新", "讨论部署成本", "提到后续路线图"],
          reason: "这篇文章直接影响后续选型。",
        }) as TOutput,
      };
    },
    openRouterProviderFactory: () => {
      providerFactoryCallCount += 1;

      return {
        chat(modelId: string) {
          return { modelId };
        },
      };
    },
  });

  const result = await client.runHeavySummary(baseInput);
  await client.runBasicAnalysis(baseInput);

  expect(result.points).toHaveLength(3);
  expect(result.evidenceSnippet).toContain("模型评测结果");
  expect(providerFactoryCallCount).toBe(1);
});

test("repair helper can normalize localized basic analysis keys and values", () => {
  const repaired = tryRepairStructuredObjectText({
    schema: BasicAnalysisSchema,
    schemaName: "basic_analysis",
    text: JSON.stringify({
      分类: ["技术测试", "AI 集成"],
      关键词: ["smart-feed", "结构化输出"],
      实体: ["smart-feed", "AI Smoke Test"],
      语言: "中文",
      情绪: "中性",
      价值分: 0.65,
    }),
  });

  expect(repaired).toEqual({
    categories: ["技术测试", "AI 集成"],
    keywords: ["smart-feed", "结构化输出"],
    entities: ["smart-feed", "AI Smoke Test"],
    language: "zh",
    sentiment: "neutral",
    valueScore: 7,
  });
});

test("repair helper can normalize heavy summary code-fenced payload", () => {
  const repaired = tryRepairStructuredObjectText({
    schema: HeavySummarySchema,
    schemaName: "heavy_summary",
    text: [
      "```json",
      JSON.stringify({
        一句话总结: "这是一个摘要",
        要点: ["第一点", "第二点"],
        关注理由: "值得继续跟进。",
        证据片段: "原文中的关键句子。",
      }),
      "```",
    ].join("\n"),
  });

  expect(repaired).toEqual({
    oneline: "这是一个摘要",
    points: ["第一点", "第二点"],
    reason: "值得继续跟进。",
    evidenceSnippet: "原文中的关键句子。",
  });
});
