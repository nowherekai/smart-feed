/**
 * AI 提示词（Prompt）定义模块
 * 负责管理系统内所有 AI 任务的指令（System Prompt）、版本、模型策略映射及输出 Schema 关联。
 */

import type { ZodType } from "zod";

import type { BasicAnalysis, HeavySummary } from "./schemas";
import { BasicAnalysisSchema, HeavySummarySchema } from "./schemas";

/** Prompt 版本号联合类型 */
type AiPromptVersion = "basic-analysis-v1" | "heavy-summary-v1";
/** 启用的 AI 运行状态 */
type EnabledAiRuntimeState = "dummy" | "openrouter";

/** AI Prompt 输入数据结构 */
export type AiPromptInput = {
  /** 清洗后的 Markdown 正文 */
  cleanedMd: string;
  /** 原始内容 URL */
  originalUrl: string;
  /** 来源显示名称 */
  sourceName: string;
  /** 内容标题 */
  title: string;
};

/** AI 请求的消息包 */
type AiPromptMessageBundle = {
  /** 用户指令 */
  prompt: string;
  /** 系统指令 */
  system: string;
};

/** 结构化 Prompt 定义接口 */
type AiPromptDefinition<TOutput> = {
  /** 构建消息包 */
  buildMessages: (input: AiPromptInput) => AiPromptMessageBundle;
  /** 获取模型策略名称（用于数据库持久化去重） */
  getModelStrategy: (runtimeState: EnabledAiRuntimeState) => string;
  /** 任务种类 */
  kind: "basic" | "heavy";
  /** 版本号 */
  promptVersion: AiPromptVersion;
  /** 校验输出的 Zod Schema */
  schema: ZodType<TOutput>;
  schemaDescription: string;
  schemaName: string;
};

/** 全局 Prompt 注册表类型 */
type PromptRegistry = {
  "basic-analysis-v1": AiPromptDefinition<BasicAnalysis>;
  "heavy-summary-v1": AiPromptDefinition<HeavySummary>;
};

/** 辅助函数：构建包含元数据和正文的上下文 Prompt */
function buildContentPrompt(input: AiPromptInput): string {
  return [
    `标题: ${input.title}`,
    `来源: ${input.sourceName}`,
    `原文链接: ${input.originalUrl}`,
    "正文:",
    input.cleanedMd,
  ].join("\n\n");
}

/**
 * 核心 Prompt 注册配置
 */
const PROMPTS: PromptRegistry = {
  /** 基础分析：侧重于客观元数据的提取和评分 */
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
  /** 深度摘要：侧重于主观总结、要点提取和证据关联 */
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

/**
 * 获取特定版本的 Prompt 定义
 */
function getPromptDefinition<TPromptVersion extends AiPromptVersion>(
  promptVersion: TPromptVersion,
): PromptRegistry[TPromptVersion] {
  return PROMPTS[promptVersion];
}

export type { AiPromptDefinition, AiPromptMessageBundle, AiPromptVersion, EnabledAiRuntimeState };
export { getPromptDefinition, PROMPTS };
