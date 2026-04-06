/**
 * AI 输出结构校验模块
 * 使用 Zod 定义 AI 返回对象的 Schema，确保下游业务逻辑能获得类型安全的数据。
 */

import { z } from "zod";

/** 通用的非空字符串校验器 */
const NonEmptyString = z.string().trim().min(1);

/** 基础分析输出结构 */
export const BasicAnalysisSchema = z.object({
  /** 内容所属分类 */
  categories: z.array(NonEmptyString).max(4).describe("内容所属分类，最多 4 个分类"),
  /** 核心关键词 */
  keywords: z.array(NonEmptyString).max(4).describe("核心关键词，最多 4 个"),
  /** 识别出的实体 (人、名、组织等) */
  entities: z.array(NonEmptyString).max(4).describe("识别出的实体，最多 4 个"),
  /** 语言代码 (如 zh, en) */
  language: NonEmptyString.describe("语言代码，如 zh, en"),
  /** 价值评分 (0-10) */
  valueScore: z.number().int().min(0).max(10).describe("基于文档对读者或业务价值的评分，一手信息高分，0-10 分。"),
});

/** 深度摘要输出结构 */
export const HeavySummarySchema = z.object({
  /** 摘要 */
  summary: NonEmptyString.describe("文档整体摘要，用一段话概括核心内容和主要信息。"),
  paragraphSummaries: z.array(NonEmptyString).describe("每个段落的摘要列表；文档短或不需要可为空数组。"),
});

export type BasicAnalysis = z.infer<typeof BasicAnalysisSchema>;
export type HeavySummary = z.infer<typeof HeavySummarySchema>;
