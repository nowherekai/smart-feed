import { expect, test } from "bun:test";
import type { ZodType } from "zod";
import { AiConfigurationError, AiProviderUnavailableError, createAiClient, resolveAiTaskConfig } from "./client";
import type { BasicAnalysis, HeavySummary } from "./schemas";

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
      return {
        object: schema.parse({
          evidenceSnippet: "AI 平台发布了新的模型评测结果",
          oneline: "Example Feed：AI 平台更新说明",
          points: ["模型评测结果更新", "讨论部署成本", "提到后续路线图"],
          reason: "这篇文章直接影响后续选型。",
        }) as TOutput,
      };
    },
    openRouterProviderFactory: () => ({
      chat(modelId: string) {
        return { modelId };
      },
    }),
  });

  const result = await client.runHeavySummary(baseInput);

  expect(result.points).toHaveLength(3);
  expect(result.evidenceSnippet).toContain("模型评测结果");
});
