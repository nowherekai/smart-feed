export type ContentDetailBase = {
  id: string;
  sourceId: string;
  kind: string;
  status: string;
  externalId: string | null;
  title: string | null;
  author: string | null;
  originalUrl: string;
  effectiveAt: Date;
  publishedAt: Date | null;
  fetchedAt: Date;
  cleanedMd: string | null;
  processingError: string | null;
  createdAt: Date;
  updatedAt: Date;
  source: {
    id: string;
    type: string;
    identifier: string;
    title: string | null;
    status: string;
    weight: number;
  };
  raw: {
    format: string;
    rawBody: string;
    rawExcerpt: string | null;
    createdAt: Date;
  } | null;
};

export type ContentDetailAnalysisRecord = {
  id: string;
  status: string;
  modelStrategy: string;
  promptVersion: string;
  categories: string[];
  keywords: string[];
  entities: string[];
  language: string | null;
  sentiment: string | null;
  valueScore: number;
  summary: {
    oneline: string;
    points: string[];
    reason: string;
  } | null;
  evidenceSnippet: string | null;
  createdAt: Date;
};

export type ContentDetailStepRun = {
  id: string;
  stepName: string;
  status: string;
  inputRef: string | null;
  outputRef: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
};

export type ContentDetailPipelineRun = {
  id: string;
  pipelineName: string;
  pipelineVersion: string;
  status: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  steps: ContentDetailStepRun[];
};

export type ContentDetailDigestRelation = {
  digestItemId: string;
  sectionTitle: string;
  rank: number;
  digestId: string;
  digestDate: string;
  period: string;
  digestStatus: string;
  analysisRecordId: string;
};

export type ContentDetailData = {
  base: ContentDetailBase;
  analysisRecords: ContentDetailAnalysisRecord[];
  pipelineRuns: ContentDetailPipelineRun[];
  digestRelations: ContentDetailDigestRelation[];
  timeZone: string;
};
