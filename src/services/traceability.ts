/**
 * 可追溯性服务模块
 * 负责验证 AI 分析记录是否满足进入摘要报告的最小元数据要求。
 * 落实“现实约束”：所有 AI 生成的内容必须可追溯到原始来源、链接和原文片段。
 */

import { logger } from "../utils";

type DigestEligibleRecord = {
  /** 内容可追溯 ID */
  contentTraceId?: string | null;
  /** 证据片段（原文摘录） */
  evidenceSnippet?: string | null;
  /** 原始内容链接 */
  originalUrl?: string | null;
  /** 来源名称 */
  sourceName?: string | null;
  /** 来源可追溯 ID */
  sourceTraceId?: string | null;
};

/**
 * 判断记录是否符合进入摘要的标准
 * 必须同时具备：来源 ID、来源名、内容 ID、原文链接、以及证据片段。
 */
export function canEnterDigest(record: DigestEligibleRecord): boolean {
  const checks = {
    sourceTraceId: Boolean(record.sourceTraceId),
    sourceName: Boolean(record.sourceName),
    contentTraceId: Boolean(record.contentTraceId),
    originalUrl: Boolean(record.originalUrl),
    evidenceSnippet: Boolean(record.evidenceSnippet),
  };

  const isEligible = Object.values(checks).every(Boolean);

  if (!isEligible) {
    logger.debug("Traceability check failed", {
      ...checks,
      contentTraceId: record.contentTraceId,
      sourceName: record.sourceName,
    });
  } else {
    logger.debug("Traceability check passed", {
      contentTraceId: record.contentTraceId,
      sourceName: record.sourceName,
    });
  }

  return isEligible;
}

export type { DigestEligibleRecord };
