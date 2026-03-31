import { z } from "zod";

const NonEmptyString = z.string().trim().min(1);

export const BasicAnalysisSchema = z.object({
  categories: z.array(NonEmptyString).max(8),
  keywords: z.array(NonEmptyString).max(12),
  entities: z.array(NonEmptyString).max(12),
  language: NonEmptyString,
  sentiment: z.enum(["positive", "neutral", "negative", "mixed"]),
  valueScore: z.number().int().min(0).max(10),
});

export const HeavySummarySchema = z.object({
  oneline: NonEmptyString,
  points: z.array(NonEmptyString).min(1).max(3),
  reason: NonEmptyString,
  evidenceSnippet: NonEmptyString,
});

export type BasicAnalysis = z.infer<typeof BasicAnalysisSchema>;
export type HeavySummary = z.infer<typeof HeavySummarySchema>;
