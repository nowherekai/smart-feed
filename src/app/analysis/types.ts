import type { AnalysisSummary } from "@/db/schema";

/** Analysis 页面列表项 */
export type AnalysisListItem = {
  id: string;
  contentId: string;
  categories: string[];
  keywords: string[];
  valueScore: number;
  status: "basic" | "full";
  summary: AnalysisSummary;
  sourceName: string;
  originalUrl: string;
  createdAt: Date;
};

/** Analysis 页面分页数据 */
export type AnalysisPageData = {
  items: AnalysisListItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  timeZone: string;
};

/** Analysis 页面 URL 参数 */
export type AnalysisSearchParams = {
  page?: string | string[] | undefined;
};
