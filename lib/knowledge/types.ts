import type { ContentStatus, KnowledgeSourceType } from "./visibility";

export type { ContentStatus, KnowledgeSourceType } from "./visibility";

export type KnowledgeKind =
  | "profile"
  | "experience"
  | "philosophy"
  | "project"
  | "upload"
  | "structured";

export type ProjectMeta = {
  id: string;
  slug: string;
  title: string;
  company: string;
  role: string;
  period: string;
  tags: string[];
  capabilityTags: string[];
  summary: string;
  status: ContentStatus;
  isDemo: boolean;
};

export type KnowledgeDocument = {
  kind: KnowledgeKind;
  path: string;
  title: string;
  status: ContentStatus;
  project?: ProjectMeta;
  body: string;
  sections: KnowledgeSection[];
  sourceType?: KnowledgeSourceType;
};

export type KnowledgeSection = {
  heading: string;
  content: string;
  evidenceId: string;
};

export type KnowledgeChunk = {
  id: string;
  evidenceId: string;
  title: string;
  text: string;
  path: string;
  kind: KnowledgeKind;
  projectId?: string;
  projectName?: string;
  section: string;
  slug?: string;
  status: ContentStatus;
  isDemo: boolean;
  knowledgeSpace: import("./spaces").KnowledgeSpaceId;
  documentId?: string;
  sourceName?: string;
  sourceType: KnowledgeSourceType;
  contentType?: "general" | "resume";
  sectionType?: string;
  company?: string;
  role?: string;
  dateRange?: string;
  school?: string;
  major?: string;
  affiliationUnknown?: boolean;
};

export type SearchHit = {
  evidenceId: string;
  title: string;
  snippet: string;
  path: string;
  projectId?: string;
  projectName?: string;
  section: string;
  score: number;
  href?: string;
  status: ContentStatus;
  isDemo: boolean;
  knowledgeSpace: import("./spaces").KnowledgeSpaceId;
  documentId?: string;
  sourceName?: string;
  sourceType: KnowledgeSourceType;
  contentType?: "general" | "resume";
  sectionType?: string;
  company?: string;
  role?: string;
  dateRange?: string;
  school?: string;
  major?: string;
  affiliationUnknown?: boolean;
  /** Dev/debug only; never required by Agent prompts. */
  bm25Score?: number;
  vectorScore?: number;
};
