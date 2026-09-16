import type { Source } from "@/lib/agent/types";

export type SourceGroup = {
  key: string;
  title: string;
  knowledgeSpace?: string;
  isDemo: boolean;
  sourceType?: Source["sourceType"];
  /** "片段" for uploaded docs; "章节" for structured/legacy sections. */
  unitLabel: "片段" | "章节";
  items: Source[];
};

/** Display-only grouping. Does not merge or alter evidence ids. */
export function groupSourcesForDisplay(sources: Source[]): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();

  for (const source of sources) {
    const key = sourceGroupKey(source);
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(source);
      existing.isDemo = existing.isDemo || isDemoSource(source);
      continue;
    }

    const sourceType = resolveSourceType(source);
    groups.set(key, {
      key,
      title: sourceGroupTitle(source),
      knowledgeSpace: source.knowledgeSpace,
      isDemo: isDemoSource(source),
      sourceType,
      unitLabel: sourceType === "uploaded" ? "片段" : "章节",
      items: [source],
    });
  }

  return [...groups.values()];
}

export function sourceGroupKey(source: Source): string {
  if (source.documentId?.trim()) {
    return `doc:${source.documentId.trim()}`;
  }
  const name = (source.sourceName ?? source.projectName ?? source.title ?? source.path ?? "")
    .trim()
    .toLowerCase();
  if (name) {
    return `name:${name}`;
  }
  return `id:${source.id}`;
}

export function sourceGroupTitle(source: Source): string {
  const type = resolveSourceType(source);
  if (type === "structured") {
    return "求职档案";
  }
  return (
    source.sourceName?.trim() ||
    source.projectName?.trim() ||
    source.title?.trim() ||
    source.path?.trim() ||
    "来源"
  );
}

export function fragmentLabel(source: Source, index: number): string {
  if (source.company && source.role) {
    return `${source.company} · ${source.role}`;
  }
  if (source.school && source.major) {
    return `${source.school} · ${source.major}`;
  }
  const section = source.section?.trim();
  if (section) {
    return section;
  }
  return `片段 ${index + 1}`;
}

export function resolveSourceType(source: Source): NonNullable<Source["sourceType"]> {
  if (source.sourceType) {
    return source.sourceType;
  }
  if (source.documentId === "job-profile") {
    return "structured";
  }
  if (source.documentId?.startsWith("doc-")) {
    return "uploaded";
  }
  if (
    source.path?.startsWith("content/") ||
    source.id.startsWith("profile:") ||
    source.id.startsWith("experience:") ||
    source.id.startsWith("project-") ||
    source.id.startsWith("demo-")
  ) {
    return "legacy";
  }
  return "uploaded";
}

function isDemoSource(source: Source) {
  return Boolean(source.isDemo || source.status === "demo");
}
