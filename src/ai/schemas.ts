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
  categories: z.array(NonEmptyString).max(8),
  /** 核心关键词 */
  keywords: z.array(NonEmptyString).max(12),
  /** 识别出的实体 (人、名、组织等) */
  entities: z.array(NonEmptyString).max(12),
  /** 语言代码 (如 zh, en) */
  language: NonEmptyString,
  /** 情感倾向 */
  sentiment: z.enum(["positive", "neutral", "negative", "mixed"]),
  /** 价值评分 (0-10) */
  valueScore: z.number().int().min(0).max(10),
});

/** 深度摘要输出结构 */
export const HeavySummarySchema = z.object({
  /** 一句话浓缩摘要 */
  oneline: NonEmptyString,
  /** 关键要点列表（最多三条） */
  points: z.array(NonEmptyString).min(1).max(3),
  /** 推荐或关注理由 */
  reason: NonEmptyString,
  /** 证据片段，必须直接摘自正文 */
  evidenceSnippet: NonEmptyString,
});

export type BasicAnalysis = z.infer<typeof BasicAnalysisSchema>;
export type HeavySummary = z.infer<typeof HeavySummarySchema>;
