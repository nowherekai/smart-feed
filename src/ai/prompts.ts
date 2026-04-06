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
    schemaDescription: "内容轻量分析结果，包含分类、关键词、实体、语言和价值分。",
    getModelStrategy(runtimeState) {
      return runtimeState === "dummy" ? "dummy-basic" : "openrouter-basic";
    },
    buildMessages(input) {
      return {
        system: `你是 smart-feed 的内容分析器。你的任务是仅基于提供的输入内容生成结构化分析结果。

          输出要求：
          1. 只输出一个合法的 JSON 对象。
          2. 不要输出任何额外文本（包括解释、说明、前后缀、markdown、代码块或注释）。
          3. 不要包含推理过程（reasoning）或中间思考。
          4. 不要补充、猜测或引入输入内容中未明确提供的信息。
          5. 所有字段内容必须直接来源于输入文本或可从中明确提取，categories、keywords、entities从上下文明显可推断的实体或关键词中提取。
          6. 空数组或空字段必须保持为空数组，不要使用 null。

          字段说明：
          - categories：内容所属分类，最多 4 个。
          - keywords：核心关键词，最多 4 个。
          - entities：识别出的关键实体，最多 4 个。
          - language：语言代码，如 zh、en。
          - valueScore：基于文档对读者或业务价值的评分，一手信息高分，0-10 分。

          请严格按照上述结构输出 JSON，不要有多余字段。
          `,
        prompt: [buildContentPrompt(input)].join("\n\n"),
      };
    },
  },
  /** 深度摘要：侧重于主观总结、要点提取和证据关联 */
  "heavy-summary-v1": {
    kind: "heavy",
    promptVersion: "heavy-summary-v1",
    schema: HeavySummarySchema,
    schemaName: "heavy_summary",
    schemaDescription: "内容深度摘要结果",
    getModelStrategy(runtimeState) {
      return runtimeState === "dummy" ? "dummy-heavy" : "openrouter-heavy";
    },
    buildMessages(input) {
      return {
        system: `你是 smart-feed 的内容分析助手。你的任务是从提供的文档中提炼核心信息，并生成结构化摘要。请严格遵循以下要求：
          输出要求：
          1. 只输出一个合法的 JSON 对象，不要 Markdown、代码块或其他文本。
          2. 不要包含推理过程、评论或个人意见。
          3. 空字段保持为空数组或空字符串，不要使用 null。
          4. 所有字段内容必须直接来源于文本或可明确提取。

          JSON 字段说明：
          1. "summary": 文档整体摘要，用一段话概括核心内容和主要信息。
          2. "paragraphSummaries": 每个段落的摘要列表；如果文档短或不需要可为空数组。

          注意事项：
          1. summary 应简洁明确，抓住核心内容。
          2. paragraphSummaries 必须紧贴文本，不允许补充未出现的信息。
          3. 输出 JSON 必须干净、严格符合上述字段和结构。`,
        prompt: [buildContentPrompt(input)].join("\n\n"),
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
