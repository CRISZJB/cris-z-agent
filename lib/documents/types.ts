import type { KnowledgeSpaceId } from "../knowledge/spaces";
import type { ContentType, ResumeSectionType } from "./resume-chunk";

export type DocumentType = "txt" | "md" | "pdf" | "docx";
export type { ContentType, ResumeSectionType };

export type StoredDocument = {
  document_id: string;
  filename: string;
  knowledge_space: KnowledgeSpaceId;
  /** File format. */
  document_type: DocumentType;
  /** Semantic kind for chunking / display. */
  content_type: ContentType;
  imported_at: string;
  source_path: string;
  char_count: number;
  chunk_count: number;
};

export type ParsedDocument = {
  document_id: string;
  filename: string;
  knowledge_space: KnowledgeSpaceId;
  document_type: DocumentType;
  text: string;
  metadata: {
    pageCount?: number;
    sourcePath: string;
  };
};

export type DocumentChunkRecord = {
  evidence_id: string;
  document_id: string;
  filename: string;
  knowledge_space: KnowledgeSpaceId;
  section: string;
  content: string;
  chunk_index: number;
  page?: number;
  content_type?: ContentType;
  section_type?: ResumeSectionType;
  company?: string;
  role?: string;
  date_range?: string;
  school?: string;
  degree?: string;
  major?: string;
  affiliation_unknown?: boolean;
};

export type DocumentsStoreFile = {
  version: 1;
  documents: StoredDocument[];
  chunks: DocumentChunkRecord[];
};

/** One education row in the structured job profile. */
export type JobEducationEntry = {
  school: string;
  degree: string;
  major: string;
  date_range: string;
};

/** Project / product under an internship or standalone. */
export type JobProjectEntry = {
  project_name: string;
  /** Employer or host org when known. */
  company: string;
  /** Alias for academic / lab hosts; normalized into company when company empty. */
  institution: string;
  role: string;
  responsibilities: string;
  results: string;
};

/** Internship / employment row with nested projects (authoritative affiliation). */
export type JobInternshipEntry = {
  company: string;
  role: string;
  date_range: string;
  projects: JobProjectEntry[];
};

export type JobSkills = {
  product: string;
  data: string;
  ai: string;
};

export type JobAcademic = {
  papers: string[];
  patents: string[];
};

/**
 * Structured job profile (authoritative facts for /job-assistant).
 * Flat string fields from older saves are accepted on read and normalized away.
 */
export type JobProfile = {
  name: string;
  english_name: string;
  email: string;
  phone: string;
  location: string;
  target_roles: string;
  github: string;
  portfolio: string;
  education: JobEducationEntry[];
  internships: JobInternshipEntry[];
  projects: JobProjectEntry[];
  skills: JobSkills;
  academic: JobAcademic;
};

export const EMPTY_JOB_SKILLS: JobSkills = {
  product: "",
  data: "",
  ai: "",
};

export const EMPTY_JOB_ACADEMIC: JobAcademic = {
  papers: [],
  patents: [],
};

export const EMPTY_JOB_PROFILE: JobProfile = {
  name: "",
  english_name: "",
  email: "",
  phone: "",
  location: "",
  target_roles: "",
  github: "",
  portfolio: "",
  education: [],
  internships: [],
  projects: [],
  skills: { ...EMPTY_JOB_SKILLS },
  academic: { papers: [], patents: [] },
};

export type JobProfileDiff = {
  path: string;
  before: string;
  after: string;
};
