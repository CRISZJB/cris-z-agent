import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { parseContentStatus, type ContentStatus } from "./visibility";
import type { KnowledgeKind } from "./types";

export const PLACEHOLDER_PATTERNS = [
  "[演示内容]",
  "[占位内容]",
  "[需要用户补充",
] as const;

export type PlaceholderHit = {
  path: string;
  marker: string;
};

export type ContentRecord = {
  path: string;
  kind: KnowledgeKind | "unknown";
  status: ContentStatus;
  statusSpecified?: boolean;
  id?: string;
  slug?: string;
  title?: string;
  body: string;
  required: {
    id?: boolean;
    title?: boolean;
    status?: boolean;
    slug?: boolean;
  };
};

export type ValidationReport = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

const CONTENT_ROOT = path.join(process.cwd(), "content");

export function findPlaceholders(text: string, filePath: string): PlaceholderHit[] {
  const hits: PlaceholderHit[] = [];
  for (const marker of PLACEHOLDER_PATTERNS) {
    if (text.includes(marker)) {
      hits.push({ path: filePath, marker });
    }
  }
  return hits;
}

export function validateContent(options?: { documents?: ContentRecord[] }): ValidationReport {
  const documents = options?.documents ?? inspectRepositoryContent();
  const errors: string[] = [];
  const warnings: string[] = [];
  const projectIds = new Map<string, string>();
  const slugs = new Map<string, string>();

  if (documents.length === 0) {
    errors.push("没有找到任何知识库文件。");
  }

  for (const document of documents) {
    if (document.required.status && document.statusSpecified === false) {
      errors.push(`${document.path} 缺少 status（demo | draft | published）。`);
    }
    if (document.required.title && !document.title) {
      errors.push(`${document.path} 缺少 title。`);
    }
    if (document.kind === "project") {
      if (document.required.id && !document.id) {
        errors.push(`${document.path} 缺少 id。`);
      }
      if (document.required.slug && !document.slug) {
        errors.push(`${document.path} 缺少 slug。`);
      }
      const filename = path.basename(document.path, ".md");
      if (document.slug && document.slug !== filename) {
        errors.push(
          `${document.path} 的 slug「${document.slug}」与文件名「${filename}」不一致，项目链接会失效。`,
        );
      }
      if (document.id) {
        const previous = projectIds.get(document.id);
        if (previous) {
          errors.push(`项目 id 重复：${document.id}（${previous} 与 ${document.path}）`);
        } else {
          projectIds.set(document.id, document.path);
        }
      }
      if (document.slug) {
        const previous = slugs.get(document.slug);
        if (previous) {
          errors.push(`项目 slug 重复：${document.slug}（${previous} 与 ${document.path}）`);
        } else {
          slugs.set(document.slug, document.path);
        }
      }
    }

    if (document.status === "published") {
      const placeholders = findPlaceholders(`${document.title ?? ""}\n${document.body}`, document.path);
      for (const hit of placeholders) {
        errors.push(
          `published 内容仍含占位标记 ${hit.marker}：${hit.path}。不能部署给招聘方。`,
        );
      }
    }
  }

  const hasPublished = documents.some((document) => document.status === "published");
  if (!hasPublished) {
    warnings.push("当前没有 status: published 的资料。生产环境智能体将无法检索任何经历。");
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function inspectRepositoryContent(): ContentRecord[] {
  const files = [
    path.join(CONTENT_ROOT, "profile.md"),
    path.join(CONTENT_ROOT, "experience.md"),
    path.join(CONTENT_ROOT, "product-philosophy.md"),
    ...listMarkdown(path.join(CONTENT_ROOT, "projects")),
  ];

  return files.filter((filePath) => fs.existsSync(filePath)).map((filePath) => {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = matter(raw);
    const relative = path.relative(process.cwd(), filePath).split(path.sep).join("/");
    const isProject = relative.includes("/projects/");
    const slug = isProject ? path.basename(filePath, ".md") : undefined;
    return {
      path: relative,
      kind: isProject
        ? "project"
        : relative.endsWith("profile.md")
          ? "profile"
          : relative.endsWith("experience.md")
            ? "experience"
            : "philosophy",
      status: parseContentStatus(parsed.data.status, parsed.data.isDemo),
      statusSpecified: typeof parsed.data.status === "string",
      id: optionalString(parsed.data.id) ?? slug,
      slug: optionalString(parsed.data.slug) ?? slug,
      title: optionalString(parsed.data.title),
      body: `${JSON.stringify(parsed.data)}\n${parsed.content}`,
      required: {
        id: isProject,
        title: true,
        status: true,
        slug: isProject,
      },
    };
  });
}

function listMarkdown(dir: string) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => path.join(dir, name));
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
