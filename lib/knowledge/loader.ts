import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { evidenceIdFor } from "./evidence";
import { splitMarkdownSections, toStringArray } from "./parse";
import { findPlaceholders } from "./validate";
import {
  getContentAudience,
  isVisibleToAudience,
  parseContentStatus,
  shouldIncludeLegacy,
} from "./visibility";
import { LEGACY_CONTENT_SPACE } from "./spaces";
import type { KnowledgeScope } from "./spaces";
import { listDocumentChunks, readJobProfile } from "../documents/store";
import { jobProfileToKnowledgeChunks } from "../documents/job-profile-evidence";
import type {
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeKind,
  KnowledgeSection,
  ProjectMeta,
} from "./types";

const CONTENT_ROOT = path.join(process.cwd(), "content");

export class ContentSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentSafetyError";
  }
}

export function getContentRoot() {
  return CONTENT_ROOT;
}

export function resetKnowledgeCache() {
  // 知识库按请求读取磁盘，便于新增 Markdown 后立即生效。
}

export function loadKnowledgeBase(scope: KnowledgeScope = "all") {
  const audience = getContentAudience();
  const includeLegacy = shouldIncludeLegacy();

  const documents = includeLegacy
    ? [
        loadStandaloneDocument("profile.md", "profile", "个人资料"),
        loadStandaloneDocument("experience.md", "experience", "工作经历"),
        loadStandaloneDocument("product-philosophy.md", "philosophy", "产品理念"),
        ...loadProjectDocuments(),
      ].filter((document) => isVisibleToAudience(document.status, audience))
    : [];

  if (includeLegacy && audience === "public") {
    assertNoPublishedPlaceholders(documents);
  }

  const legacyChunks = documents.flatMap(documentToChunks);
  const structuredChunks = structuredChunksToKnowledge(scope);
  const uploadChunks = uploadedChunksToKnowledge(scope);
  const scopedLegacy =
    scope === "all"
      ? legacyChunks
      : legacyChunks.filter((chunk) => chunk.knowledgeSpace === scope);
  const chunks = [...scopedLegacy, ...structuredChunks, ...uploadChunks];
  return { documents, chunks, loadedAt: Date.now(), audience, scope, includeLegacy };
}

export function loadProfile() {
  const { documents, audience, includeLegacy } = loadKnowledgeBase();
  const profile = documents.find((doc) => doc.kind === "profile");
  const experience = documents.find((doc) => doc.kind === "experience");
  const philosophy = documents.find((doc) => doc.kind === "philosophy") ?? null;

  if (!profile || !experience) {
    if (!includeLegacy) {
      throw new Error("旧兼容资料未启用。请检索已上传文档或使用求职档案。");
    }
    if (audience === "public") {
      throw new Error("公开知识库缺少已发布的个人资料。");
    }
    throw new Error("作品集基础资料文件缺失。");
  }

  return { profile, experience, philosophy };
}

export function listProjects() {
  const { documents } = loadKnowledgeBase();
  return documents
    .filter((doc) => doc.kind === "project" && doc.project)
    .map((doc) => doc.project as ProjectMeta);
}

export function loadProject(projectId: string) {
  const { documents } = loadKnowledgeBase();
  const normalized = projectId.trim().toLowerCase();
  const document = documents.find((doc) => {
    if (doc.kind !== "project" || !doc.project) {
      return false;
    }
    return (
      doc.project.id.toLowerCase() === normalized ||
      doc.project.slug.toLowerCase() === normalized
    );
  });
  return document ?? null;
}

function loadStandaloneDocument(
  filename: string,
  kind: KnowledgeKind,
  fallbackTitle: string,
): KnowledgeDocument {
  const filePath = path.join(CONTENT_ROOT, filename);
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = matter(raw);
  const title = String(parsed.data.title ?? fallbackTitle);
  const status = parseContentStatus(parsed.data.status, parsed.data.isDemo);
  const body = parsed.content.trim();
  const sections = toSections(kind, body);

  return {
    kind,
    path: toPublicPath(filePath),
    title,
    status,
    body,
    sections,
    sourceType: "legacy",
  };
}

function loadProjectDocuments(): KnowledgeDocument[] {
  const projectsDir = path.join(CONTENT_ROOT, "projects");
  if (!fs.existsSync(projectsDir)) {
    return [];
  }

  return fs
    .readdirSync(projectsDir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => {
      const filePath = path.join(projectsDir, name);
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = matter(raw);
      const slug = path.basename(name, ".md");
      const project = toProjectMeta(parsed.data, slug);
      const body = parsed.content.trim();

      return {
        kind: "project" as const,
        path: toPublicPath(filePath),
        title: project.title,
        status: project.status,
        project,
        body,
        sections: toSections(project.id, body),
        sourceType: "legacy" as const,
      };
    });
}

function toProjectMeta(data: Record<string, unknown>, fallbackSlug: string): ProjectMeta {
  const id = String(data.id ?? fallbackSlug).trim();
  const slug = String(data.slug ?? fallbackSlug).trim();
  const status = parseContentStatus(data.status, data.isDemo);
  return {
    id,
    slug,
    title: String(data.title ?? id).trim(),
    company: optionalMeta(data.company ?? data.background, "未写明背景"),
    role: optionalMeta(data.role, "未写明角色"),
    period: optionalMeta(data.period ?? data.year, "未写明时间"),
    tags: toStringArray(data.tags),
    capabilityTags: toStringArray(
      data.capabilityTags ?? data.capability_tags ?? data.skills,
    ),
    summary: optionalMeta(data.summary, "未写明简介"),
    status,
    isDemo: status === "demo",
  };
}

function optionalMeta(value: unknown, fallback: string) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function toSections(documentKey: string, body: string): KnowledgeSection[] {
  const sections = splitMarkdownSections(body);
  return sections.map((section) => ({
    ...section,
    evidenceId: evidenceIdFor(documentKey, section.heading),
  }));
}

function documentToChunks(document: KnowledgeDocument): KnowledgeChunk[] {
  const documentKey = document.project?.id ?? document.kind;
  const sections =
    document.sections.length > 0
      ? document.sections
      : [
          {
            heading: document.title,
            content: document.body,
            evidenceId: evidenceIdFor(documentKey, document.title),
          },
        ];

  return sections.map((section) => ({
    id: section.evidenceId,
    evidenceId: section.evidenceId,
    title: document.title,
    text: section.content,
    path: document.path,
    kind: document.kind,
    projectId: document.project?.id,
    projectName: document.project?.title,
    section: section.heading,
    slug: document.project?.slug,
    status: document.status,
    isDemo: document.status === "demo",
    knowledgeSpace: LEGACY_CONTENT_SPACE,
    documentId: documentKey,
    sourceName: document.title,
    sourceType: "legacy" as const,
  }));
}

function uploadedChunksToKnowledge(scope: KnowledgeScope): KnowledgeChunk[] {
  return listDocumentChunks(scope).map((chunk) => ({
    id: chunk.evidence_id,
    evidenceId: chunk.evidence_id,
    title: chunk.filename,
    text: chunk.content,
    path: chunk.filename,
    kind: "upload" as const,
    section: chunk.section,
    status: "published" as const,
    isDemo: false,
    knowledgeSpace: chunk.knowledge_space,
    documentId: chunk.document_id,
    sourceName: chunk.filename,
    sourceType: "uploaded" as const,
    contentType: chunk.content_type,
    sectionType: chunk.section_type,
    company: chunk.company,
    role: chunk.role,
    dateRange: chunk.date_range,
    school: chunk.school,
    major: chunk.major,
    affiliationUnknown: chunk.affiliation_unknown,
  }));
}

function structuredChunksToKnowledge(scope: KnowledgeScope): KnowledgeChunk[] {
  if (scope !== "all" && scope !== "job") {
    return [];
  }
  return jobProfileToKnowledgeChunks(readJobProfile());
}

function assertNoPublishedPlaceholders(documents: KnowledgeDocument[]) {
  for (const document of documents) {
    if (document.status !== "published") {
      continue;
    }
    const hits = findPlaceholders(
      `${document.title}\n${document.body}\n${document.project?.company ?? ""}\n${document.project?.summary ?? ""}`,
      document.path,
    );
    if (hits.length > 0) {
      throw new ContentSafetyError(
        `公开知识库中的 published 内容含有占位标记（${hits[0]?.marker} @ ${hits[0]?.path}）。拒绝对外提供。`,
      );
    }
  }
}

function toPublicPath(filePath: string) {
  return path.relative(process.cwd(), filePath).split(path.sep).join("/");
}
