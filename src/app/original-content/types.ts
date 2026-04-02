export type OriginalContentFilterRange = "all" | "today" | "last-2-days" | "last-week";

export type OriginalContentListItem = {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  author: string | null;
  originalUrl: string;
  effectiveAt: Date;
  previewText: string;
};

export type OriginalContentSourceOption = {
  id: string;
  title: string;
  identifier: string;
  label: string;
};

export type OriginalContentPageData = {
  items: OriginalContentListItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  selectedRange: OriginalContentFilterRange;
  selectedSourceId: string | null;
};

export type OriginalContentSearchParams = {
  page?: string | string[] | undefined;
  range?: string | string[] | undefined;
  sourceId?: string | string[] | undefined;
};

export type OriginalContentFilterParams = {
  page: number;
  range: OriginalContentFilterRange;
  sourceId: string | null;
};
