export const KNOWLEDGE_SPACES = [
  { id: "work", label: "工作" },
  { id: "job", label: "求职" },
  { id: "study", label: "学习" },
  { id: "personal", label: "个人" },
  { id: "temporary", label: "临时资料" },
] as const;

export type KnowledgeSpaceId = (typeof KNOWLEDGE_SPACES)[number]["id"];

export type KnowledgeScope = KnowledgeSpaceId | "all";

export function isKnowledgeSpaceId(value: string): value is KnowledgeSpaceId {
  return KNOWLEDGE_SPACES.some((space) => space.id === value);
}

export function parseKnowledgeScope(value: unknown): KnowledgeScope {
  if (value === "all" || value === undefined || value === null || value === "") {
    return "all";
  }
  const text = String(value).trim().toLowerCase();
  if (text === "all") {
    return "all";
  }
  if (isKnowledgeSpaceId(text)) {
    return text;
  }
  return "all";
}

export function knowledgeSpaceLabel(id: KnowledgeSpaceId | string): string {
  const found = KNOWLEDGE_SPACES.find((space) => space.id === id);
  return found?.label ?? id;
}

/** Legacy portfolio Markdown content maps into the job space. */
export const LEGACY_CONTENT_SPACE: KnowledgeSpaceId = "job";
