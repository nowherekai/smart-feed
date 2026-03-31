import type { ZodType } from "zod";

import type { BasicAnalysis, HeavySummary } from "./schemas";
import { BasicAnalysisSchema, HeavySummarySchema } from "./schemas";

type AiPromptVersion = "basic-analysis-v1" | "heavy-summary-v1";
type EnabledAiRuntimeState = "dummy" | "openrouter";

export type AiPromptInput = {
  cleanedMd: string;
  originalUrl: string;
  sourceName: string;
  title: string;
};

type AiPromptMessageBundle = {
  prompt: string;
  system: string;
};

type AiPromptDefinition<TOutput> = {
  buildMessages: (input: AiPromptInput) => AiPromptMessageBundle;
  getModelStrategy: (runtimeState: EnabledAiRuntimeState) => string;
  kind: "basic" | "heavy";
  promptVersion: AiPromptVersion;
  schema: ZodType<TOutput>;
  schemaDescription: string;
  schemaName: string;
};

type PromptRegistry = {
  "basic-analysis-v1": AiPromptDefinition<BasicAnalysis>;
  "heavy-summary-v1": AiPromptDefinition<HeavySummary>;
};

function buildContentPrompt(input: AiPromptInput): string {
  return [
    `标题: ${input.title}`,
    `来源: ${input.sourceName}`,
    `原文链接: ${input.originalUrl}`,
    "正文:",
    input.cleanedMd,
  ].join("\n\n");
}

const PROMPTS: PromptRegistry = {
  "basic-analysis-v1": {
    kind: "basic",
    promptVersion: "basic-analysis-v1",
    schema: BasicAnalysisSchema,
    schemaName: "basic_analysis",
    schemaDescription: "内容轻量分析结果，包含分类、关键词、实体、语言、情绪和价值分。",
    getModelStrategy(runtimeState) {
      return runtimeState === "dummy" ? "dummy-basic" : "openrouter-basic";
    },
    buildMessages(input) {
      return {
        system: "你是 smart-feed 的内容分析器。请只基于给定内容输出结构化 JSON，不要补充正文中不存在的事实。",
        prompt: [
          "请分析下面的文章，输出分类、关键词、实体、语言、情绪和 0-10 的价值分。",
          "价值分用于决定是否进入后续深度摘要。",
          buildContentPrompt(input),
        ].join("\n\n"),
      };
    },
  },
  "heavy-summary-v1": {
    kind: "heavy",
    promptVersion: "heavy-summary-v1",
    schema: HeavySummarySchema,
    schemaName: "heavy_summary",
    schemaDescription: "内容深度摘要结果，包含一句话总结、三条要点、关注理由和证据片段。",
    getModelStrategy(runtimeState) {
      return runtimeState === "dummy" ? "dummy-heavy" : "openrouter-heavy";
    },
    buildMessages(input) {
      return {
        system: "你是 smart-feed 的摘要生成器。请只基于给定内容输出结构化 JSON，证据片段必须直接摘自正文。",
        prompt: [
          "请生成一句话总结、最多三条要点、关注理由，以及一段可直接追溯到正文的证据片段。",
          buildContentPrompt(input),
        ].join("\n\n"),
      };
    },
  },
};

function getPromptDefinition<TPromptVersion extends AiPromptVersion>(
  promptVersion: TPromptVersion,
): PromptRegistry[TPromptVersion] {
  return PROMPTS[promptVersion];
}

export type { AiPromptDefinition, AiPromptMessageBundle, AiPromptVersion, EnabledAiRuntimeState };
export { getPromptDefinition, PROMPTS };
