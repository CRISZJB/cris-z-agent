import { z } from "zod";
import {
  countDocumentsBySpace,
  getDocumentChunks,
  getStoredDocument,
  listStoredDocuments,
  readDocumentsStore,
} from "../documents";
import { listProjects, loadProfile, loadProject, searchAsync } from "../knowledge";
import { loadKnowledgeBase } from "../knowledge/loader";
import { KNOWLEDGE_SPACES, isKnowledgeSpaceId, type KnowledgeScope } from "../knowledge/spaces";
import { shouldIncludeLegacy } from "../knowledge/visibility";
import { getToolKnowledgeScope } from "./runtime-scope";
import {
  COMPAT_SECTION_MAX_CHARS,
  READ_DOCUMENT_DEFAULT_MAX_CHARS,
  SEARCH_RESULT_CONTENT_MAX_CHARS,
  SOURCE_PREVIEW_MAX_CHARS,
  truncateForModel,
} from "./tool-limits";
import type { Source, ToolDefinition, ToolTrace } from "./types";

const SearchKnowledgeSchema = z.object({
  query: z.string().trim().min(1, "query 不能为空"),
  limit: z.number().int().min(1).max(8).optional(),
  knowledge_space: z.string().optional(),
});

const GetProjectSchema = z.object({
  project_id: z.string().trim().min(1, "project_id 不能为空"),
});

const ListDocumentsSchema = z.object({
  knowledge_space: z.string().optional(),
});

const ReadDocumentSchema = z.object({
  document_id: z.string().trim().min(1, "document_id 不能为空"),
  chunk_index: z.number().int().min(1).optional(),
  section: z.string().trim().min(1).optional(),
  query: z.string().trim().min(1).optional(),
  max_chars: z.number().int().min(500).max(12_000).optional(),
});

const EmptySchema = z.object({}).passthrough();

type ToolHandler = (args: unknown) => unknown | Promise<unknown>;

type ToolResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
  evidence: Source[];
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "search_knowledge",
      description:
        "在个人知识库中搜索相关资料片段。涉及我的文件、经历、项目、笔记或“根据我的资料生成”时优先且通常只需使用本工具。每条结果都有 evidence_id。搜索结果足够时请停止调用其他工具。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "检索词，建议包含关键对象或文件主题。",
          },
          limit: {
            type: "integer",
            description: "返回条数，默认 5，最大 8。仅当用户明确要求更多证据时再提高。",
          },
          knowledge_space: {
            type: "string",
            description: "可选：work / job / study / personal / temporary。不传则使用当前会话知识范围。",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_documents",
      description:
        "列出已导入的本地文档元数据（不含正文）。仅当用户明确询问有哪些文件/目录，或 search 无法定位 document_id 时使用。不要在生成类任务中作为第一步。",
      parameters: {
        type: "object",
        properties: {
          knowledge_space: {
            type: "string",
            description: "可选知识空间：work / job / study / personal / temporary。",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_document",
      description:
        "按需读取已导入文档的片段。仅当 search_knowledge 片段明显不足时使用。请尽量指定 chunk_index、section 或 query；未指定时只返回有限长度预览，不会一次塞入整篇长文。",
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string", description: "文档 ID，例如 doc-xxxx" },
          chunk_index: { type: "integer", description: "可选，只读某一片段编号（从 1 开始）" },
          section: { type: "string", description: "可选，按章节/片段标题过滤（子串匹配）" },
          query: { type: "string", description: "可选，只返回内容匹配该关键词的片段" },
          max_chars: {
            type: "integer",
            description: `可选，本次返回正文总字符上限，默认 ${READ_DOCUMENT_DEFAULT_MAX_CHARS}。`,
          },
        },
        required: ["document_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_knowledge_spaces",
      description:
        "列出知识空间及各自已导入文档数量。仅当用户明确询问知识空间概况时使用；生成/事实问答不要先调此工具。",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_project",
      description:
        "读取旧版作品集项目案例（求职 job 空间兼容 Markdown，例如 project-1）。仅当问题明确指向这些旧项目案例时使用；用户导入文档请优先 search_knowledge / read_document。",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "string",
            description: "项目编号或 slug。",
          },
        },
        required: ["project_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_profile",
      description:
        "读取旧版 profile/experience 兼容 Markdown（求职 job 空间）。仅当问题明确需要这些旧档案字段时使用；不要与 search_knowledge 重复拉取大量重叠经历。",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_projects",
      description:
        "列出旧版可见项目（求职兼容）。仅当用户明确询问旧作品集项目列表时使用。",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];

const handlers: Record<string, ToolHandler> = {
  search_knowledge: async (args) => {
    const { query, limit, knowledge_space } = SearchKnowledgeSchema.parse(args);
    const scope =
      knowledge_space && isKnowledgeSpaceId(knowledge_space)
        ? knowledge_space
        : getToolKnowledgeScope();
    const hits = await searchAsync(query, limit ?? 5, { scope });
    const texts = resolveChunkTexts(scope);
    return {
      query,
      knowledge_space: scope,
      results: hits.map((hit) => {
        const full = texts.get(hit.evidenceId) ?? hit.snippet;
        const { text, truncated } = truncateForModel(full, SEARCH_RESULT_CONTENT_MAX_CHARS);
        return {
          evidence_id: hit.evidenceId,
          title: hit.title,
          snippet: text,
          truncated,
          path: hit.path,
          project_id: hit.projectId,
          project_name: hit.projectName,
          section: hit.section,
          score: hit.score,
          href: hit.href,
          status: hit.status,
          is_demo: hit.isDemo,
          knowledge_space: hit.knowledgeSpace,
          document_id: hit.documentId,
          source_name: hit.sourceName,
          source_type: hit.sourceType,
          content_type: hit.contentType,
          section_type: hit.sectionType,
          company: hit.company,
          role: hit.role,
          date_range: hit.dateRange,
          school: hit.school,
          major: hit.major,
          affiliation_unknown: hit.affiliationUnknown,
        };
      }),
    };
  },
  list_documents: (args) => {
    const { knowledge_space } = ListDocumentsSchema.parse(args ?? {});
    const scope =
      knowledge_space && isKnowledgeSpaceId(knowledge_space)
        ? knowledge_space
        : getToolKnowledgeScope();
    const documents = listStoredDocuments(scope);
    return {
      knowledge_space: scope,
      documents: documents.map((doc) => ({
        document_id: doc.document_id,
        filename: doc.filename,
        knowledge_space: doc.knowledge_space,
        document_type: doc.document_type,
        imported_at: doc.imported_at,
        chunk_count: doc.chunk_count,
      })),
    };
  },
  read_document: (args) => {
    const { document_id, chunk_index, section, query, max_chars } = ReadDocumentSchema.parse(args);
    const budget = max_chars ?? READ_DOCUMENT_DEFAULT_MAX_CHARS;
    const doc = getStoredDocument(document_id);
    if (!doc) {
      return { found: false, document_id, message: "未找到该文档。" };
    }

    let chunks = getDocumentChunks(document_id);
    if (chunk_index) {
      chunks = chunks.filter((chunk) => chunk.chunk_index === chunk_index);
    }
    if (section) {
      const needle = section.toLowerCase();
      chunks = chunks.filter((chunk) => (chunk.section ?? "").toLowerCase().includes(needle));
    }
    if (query) {
      const needle = query.toLowerCase();
      chunks = chunks.filter((chunk) => chunk.content.toLowerCase().includes(needle));
    }

    const selected: Array<{
      evidence_id: string;
      section: string;
      content: string;
      chunk_index: number;
      truncated: boolean;
      content_type?: string;
      section_type?: string;
      company?: string;
      role?: string;
      date_range?: string;
      school?: string;
      major?: string;
      affiliation_unknown?: boolean;
    }> = [];
    let used = 0;
    let omitted = 0;

    for (const chunk of chunks) {
      if (used >= budget) {
        omitted += 1;
        continue;
      }
      const remaining = budget - used;
      const { text, truncated } = truncateForModel(chunk.content, remaining);
      if (!text) {
        omitted += 1;
        continue;
      }
      selected.push({
        evidence_id: chunk.evidence_id,
        section: chunk.section,
        content: text,
        chunk_index: chunk.chunk_index,
        truncated,
        content_type: chunk.content_type,
        section_type: chunk.section_type,
        company: chunk.company,
        role: chunk.role,
        date_range: chunk.date_range,
        school: chunk.school,
        major: chunk.major,
        affiliation_unknown: chunk.affiliation_unknown,
      });
      used += text.length;
    }

    const hasMore = omitted > 0 || chunks.length > selected.length;
    return {
      found: true,
      document: {
        document_id: doc.document_id,
        filename: doc.filename,
        knowledge_space: doc.knowledge_space,
        document_type: doc.document_type,
        imported_at: doc.imported_at,
        total_chunks: getDocumentChunks(document_id).length,
      },
      chunks: selected,
      returned_chars: used,
      max_chars: budget,
      truncated: hasMore,
      message: hasMore
        ? "文档还有更多内容，如需要请指定 section / chunk_index / query 继续读取。"
        : undefined,
    };
  },
  list_knowledge_spaces: (args) => {
    EmptySchema.parse(args ?? {});
    const counts = countDocumentsBySpace();
    return {
      spaces: KNOWLEDGE_SPACES.map((space) => ({
        id: space.id,
        label: space.label,
        document_count: counts[space.id],
      })),
    };
  },
  get_project: (args) => {
    if (!shouldIncludeLegacy()) {
      return {
        found: false,
        message:
          "当前未启用旧兼容资料。请用 search_knowledge / read_document 检索已上传文档，或开启「使用旧兼容数据」。",
        available_projects: [],
      };
    }
    const { project_id } = GetProjectSchema.parse(args);
    const document = loadProject(project_id);
    if (!document?.project) {
      const available = listProjects().map((project) => ({
        id: project.id,
        slug: project.slug,
        title: project.title,
      }));
      const listed =
        available.length > 0
          ? available.map((project) => `${project.id}（${project.title}）`).join("、")
          : "（无）";
      return {
        found: false,
        project_id,
        message: `该项目不存在于当前可访问知识库。当前项目为：${listed}。请使用当前项目的 id 或 slug。`,
        available_projects: available,
      };
    }

    return {
      found: true,
      project: {
        id: document.project.id,
        slug: document.project.slug,
        title: document.project.title,
        company: document.project.company,
        role: document.project.role,
        period: document.project.period,
        tags: document.project.tags,
        capability_tags: document.project.capabilityTags,
        summary: truncateForModel(document.project.summary, COMPAT_SECTION_MAX_CHARS).text,
        status: document.project.status,
        is_demo: document.project.isDemo,
        path: document.path,
        href: `/projects/${document.project.slug}`,
        knowledge_space: "job",
        sections: document.sections.map((section) => {
          const { text, truncated } = truncateForModel(section.content, COMPAT_SECTION_MAX_CHARS);
          return {
            evidence_id: section.evidenceId,
            heading: section.heading,
            content: text,
            truncated,
          };
        }),
      },
    };
  },
  get_profile: (args) => {
    EmptySchema.parse(args ?? {});
    if (!shouldIncludeLegacy()) {
      return {
        available: false,
        message:
          "当前未启用旧兼容资料（content/profile 等）。请用 search_knowledge 检索已上传文档，或使用求职档案。",
      };
    }
    const { profile, experience, philosophy } = loadProfile();
    return {
      knowledge_space: "job",
      profile: serializeDoc(profile.kind, profile.title, profile.path, profile.status, profile.sections),
      experience: serializeDoc(
        experience.kind,
        experience.title,
        experience.path,
        experience.status,
        experience.sections,
      ),
      philosophy: philosophy
        ? serializeDoc(
            philosophy.kind,
            philosophy.title,
            philosophy.path,
            philosophy.status,
            philosophy.sections,
          )
        : { missing: true, message: "当前可见知识库没有独立的产品理念文档。" },
    };
  },
  list_projects: (args) => {
    EmptySchema.parse(args ?? {});
    if (!shouldIncludeLegacy()) {
      return {
        knowledge_space: "job",
        projects: [],
        message:
          "当前未启用旧兼容资料。已上传文档请用 list_documents / search_knowledge。",
      };
    }
    return {
      knowledge_space: "job",
      projects: listProjects().map((project) => ({
        evidence_id: `${project.id}:overview`,
        id: project.id,
        slug: project.slug,
        title: project.title,
        summary: truncateForModel(project.summary, COMPAT_SECTION_MAX_CHARS).text,
        tags: project.tags,
        capability_tags: project.capabilityTags,
        period: project.period,
        status: project.status,
        is_demo: project.isDemo,
        href: `/projects/${project.slug}`,
        knowledge_space: "job",
      })),
    };
  },
};

export async function executeTool(
  name: string,
  rawArguments: string,
): Promise<{ result: ToolResult; trace: ToolTrace }> {
  const handler = handlers[name];
  if (!handler) {
    const error = `未知工具：${name}`;
    return {
      result: { ok: false, error, evidence: [] },
      trace: { name, input: rawArguments, output: { error }, error },
    };
  }

  let parsed: unknown = {};
  try {
    parsed = rawArguments.trim() ? JSON.parse(rawArguments) : {};
  } catch {
    const error = "工具参数不是合法 JSON。";
    return {
      result: { ok: false, error, evidence: [] },
      trace: { name, input: rawArguments, output: { error }, error },
    };
  }

  try {
    const data = await handler(parsed);
    const evidence = extractEvidence(name, data);
    return {
      result: { ok: true, data, evidence },
      trace: { name, input: parsed, output: data },
    };
  } catch (error) {
    const message = formatToolError(error);
    return {
      result: { ok: false, error: message, evidence: [] },
      trace: { name, input: parsed, output: { error: message }, error: message },
    };
  }
}

export function extractEvidence(toolName: string, data: unknown): Source[] {
  if (!data || typeof data !== "object") {
    return [];
  }

  if (toolName === "search_knowledge" && "results" in data) {
    const results = (data as { results: Array<Record<string, unknown>> }).results ?? [];
    return results.map((item) => {
      const source = sourceFromRecord(item);
      const fromStore = resolveStoreSnippet(source.id);
      if (fromStore) {
        source.snippet = fromStore;
      }
      return source;
    });
  }

  if (toolName === "read_document" && "chunks" in data) {
    const payload = data as {
      found?: boolean;
      document?: { filename?: string; knowledge_space?: string; document_id?: string };
      chunks?: Array<Record<string, unknown>>;
    };
    if (!payload.found) {
      return [];
    }
    return (payload.chunks ?? []).map((chunk) => {
      const id = String(chunk.evidence_id ?? "");
      return {
        id,
        title: payload.document?.filename ?? "文档",
        path: payload.document?.filename ?? "",
        section: optionalString(chunk.section),
        knowledgeSpace: optionalString(payload.document?.knowledge_space),
        documentId: optionalString(payload.document?.document_id),
        sourceName: payload.document?.filename,
        snippet: resolveStoreSnippet(id) ?? optionalString(chunk.content)?.slice(0, SOURCE_PREVIEW_MAX_CHARS),
        status: "published" as const,
        isDemo: false,
        sourceType: "uploaded" as const,
        contentType: optionalContentType(chunk.content_type),
        sectionType: optionalString(chunk.section_type),
        company: optionalString(chunk.company),
        role: optionalString(chunk.role),
        dateRange: optionalString(chunk.date_range),
        school: optionalString(chunk.school),
        major: optionalString(chunk.major),
        affiliationUnknown: chunk.affiliation_unknown === true,
      };
    });
  }

  if (toolName === "get_project" && "project" in data) {
    const project = (data as { project?: Record<string, unknown> }).project;
    if (!project) {
      return [];
    }
    const sections = Array.isArray(project.sections) ? project.sections : [];
    return sections.map((section) => {
      const row = section as Record<string, unknown>;
      const id = String(row.evidence_id ?? "");
      return {
        id,
        title: String(project.title ?? "项目"),
        path: String(project.path ?? ""),
        projectId: optionalString(project.id),
        projectName: optionalString(project.title),
        section: optionalString(row.heading),
        href: optionalString(project.href),
        status: optionalStatus(project.status),
        isDemo: Boolean(project.is_demo),
        knowledgeSpace: "job",
        documentId: optionalString(project.id),
        sourceName: optionalString(project.title),
        snippet: resolveStoreSnippet(id) ?? optionalString(row.content)?.slice(0, SOURCE_PREVIEW_MAX_CHARS),
        sourceType: "legacy" as const,
      };
    });
  }

  if (toolName === "get_profile") {
    const payload = data as Record<
      string,
      { title?: string; path?: string; status?: string; sections?: Array<Record<string, unknown>> }
    >;
    return ["profile", "experience", "philosophy"].flatMap((key) => {
      const item = payload[key] as
        | {
            missing?: boolean;
            title?: string;
            path?: string;
            status?: string;
            sections?: Array<Record<string, unknown>>;
          }
        | undefined;
      if (!item || item.missing) {
        return [];
      }
      return (item.sections ?? []).map((section) => {
        const id = String(section.evidence_id ?? "");
        return {
          id,
          title: item.title ?? "个人资料",
          path: item.path ?? "",
          section: optionalString(section.heading),
          status: optionalStatus(item.status),
          isDemo: item.status === "demo",
          knowledgeSpace: "job",
          sourceName: item.title,
          snippet: resolveStoreSnippet(id) ?? optionalString(section.content)?.slice(0, SOURCE_PREVIEW_MAX_CHARS),
          sourceType: "legacy" as const,
        };
      });
    });
  }

  if (toolName === "list_projects" && "projects" in data) {
    const projects = (data as { projects: Array<Record<string, unknown>> }).projects ?? [];
    return projects.map((project) => ({
      id: String(project.evidence_id ?? `${project.id}:overview`),
      title: String(project.title ?? "项目"),
      path: `content/projects/${String(project.slug ?? "")}.md`,
      projectId: optionalString(project.id),
      projectName: optionalString(project.title),
      section: "一句话介绍",
      href: optionalString(project.href),
      status: optionalStatus(project.status),
      isDemo: Boolean(project.is_demo),
      knowledgeSpace: "job",
      sourceName: optionalString(project.title),
      sourceType: "legacy" as const,
    }));
  }

  return [];
}

function resolveChunkTexts(scope: KnowledgeScope) {
  const map = new Map<string, string>();
  for (const chunk of loadKnowledgeBase(scope).chunks) {
    map.set(chunk.evidenceId, chunk.text);
  }
  return map;
}

/** Prefer original local store / knowledge text for Sources UI previews. */
function resolveStoreSnippet(evidenceId: string): string | undefined {
  if (!evidenceId) {
    return undefined;
  }
  const uploaded = readDocumentsStore().chunks.find((chunk) => chunk.evidence_id === evidenceId);
  if (uploaded?.content) {
    return truncateForModel(uploaded.content, SOURCE_PREVIEW_MAX_CHARS).text;
  }
  const kb = loadKnowledgeBase("all").chunks.find((chunk) => chunk.evidenceId === evidenceId);
  if (kb?.text) {
    return truncateForModel(kb.text, SOURCE_PREVIEW_MAX_CHARS).text;
  }
  return undefined;
}

function serializeDoc(
  key: string,
  title: string,
  filePath: string,
  status: string,
  sections: Array<{ heading: string; content: string; evidenceId: string }>,
) {
  return {
    title,
    path: filePath,
    status,
    sections: sections.map((section) => {
      const { text, truncated } = truncateForModel(section.content, COMPAT_SECTION_MAX_CHARS);
      return {
        evidence_id: section.evidenceId,
        heading: section.heading,
        content: text,
        truncated,
      };
    }),
    document_key: key,
  };
}

function sourceFromRecord(item: Record<string, unknown>): Source {
  const sourceType = optionalSourceType(item.source_type);
  return {
    id: String(item.evidence_id ?? ""),
    title: String(item.title ?? "知识库片段"),
    path: String(item.path ?? ""),
    projectId: optionalString(item.project_id),
    projectName: optionalString(item.project_name),
    section: optionalString(item.section),
    href: optionalString(item.href),
    status: optionalStatus(item.status),
    isDemo: Boolean(item.is_demo),
    knowledgeSpace: optionalString(item.knowledge_space),
    documentId: optionalString(item.document_id),
    sourceName: optionalString(item.source_name) ?? optionalString(item.title),
    snippet: optionalString(item.snippet),
    sourceType,
    contentType: optionalContentType(item.content_type),
    sectionType: optionalString(item.section_type),
    company: optionalString(item.company),
    role: optionalString(item.role),
    dateRange: optionalString(item.date_range),
    school: optionalString(item.school),
    major: optionalString(item.major),
    affiliationUnknown: item.affiliation_unknown === true,
  };
}

function optionalContentType(value: unknown): Source["contentType"] {
  if (value === "resume" || value === "general") {
    return value;
  }
  return undefined;
}

function optionalSourceType(value: unknown): Source["sourceType"] {
  if (value === "uploaded" || value === "structured" || value === "legacy") {
    return value;
  }
  return undefined;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalStatus(value: unknown): Source["status"] {
  if (value === "demo" || value === "draft" || value === "published") {
    return value;
  }
  return undefined;
}

function formatToolError(error: unknown) {
  if (error instanceof z.ZodError) {
    return `工具参数无效：${error.issues.map((issue) => issue.message).join("；")}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "工具执行失败。";
}
