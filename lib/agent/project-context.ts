import { listProjects, type ProjectMeta } from "../knowledge";

const NEW_BIOGRAPHY_TOPIC =
  /介绍一下你自己|你自己|工作过|在哪里工作|学历|毕业|学校|google|tiktok|字节|阿里/i;

export function findProjectsInText(text: string, projects = listProjects()): ProjectMeta[] {
  const hits = projects.filter((project) => {
    const haystack = text.toLowerCase();
    return (
      haystack.includes(project.id.toLowerCase()) ||
      haystack.includes(project.slug.toLowerCase()) ||
      haystack.includes(project.title.toLowerCase())
    );
  });
  return uniqueById(hits);
}

export function findUniqueProjectContext(
  messages: Array<{ role: string; content?: string | null }>,
): ProjectMeta | null {
  const projects = listProjects();
  if (projects.length === 0) {
    return null;
  }

  let current: ProjectMeta | null = null;
  for (const message of messages) {
    const text = message.content?.trim() ?? "";
    if (!text) {
      continue;
    }
    const hits = findProjectsInText(text, projects);
    if (hits.length === 1) {
      current = hits[0] ?? null;
    } else if (hits.length > 1) {
      current = null;
    }
  }
  return current;
}

export function inheritProjectContext(
  messages: Array<{ role: string; content?: string | null }>,
): ProjectMeta | null {
  const project = findUniqueProjectContext(messages);
  if (!project) {
    return null;
  }
  const latest = lastUserText(messages);
  if (!latest) {
    return project;
  }
  if (NEW_BIOGRAPHY_TOPIC.test(latest) && !mentionsProject(latest, project)) {
    return null;
  }
  const other = findProjectsInText(latest).filter((item) => item.id !== project.id);
  if (other.length > 0) {
    return null;
  }
  return project;
}

export function projectContextHint(project: ProjectMeta): string {
  return `当前对话已明确讨论项目「${project.title}」（project_id: ${project.id}）。省略主语的追问默认指该项目，优先阅读该项目的复盘、取舍和结果，不要改去解释本系统的规则。`;
}

function lastUserText(messages: Array<{ role: string; content?: string | null }>): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      return messages[i]?.content ?? "";
    }
  }
  return "";
}

function mentionsProject(text: string, project: ProjectMeta) {
  const haystack = text.toLowerCase();
  return (
    haystack.includes(project.id.toLowerCase()) ||
    haystack.includes(project.slug.toLowerCase()) ||
    haystack.includes(project.title.toLowerCase())
  );
}

function uniqueById(projects: ProjectMeta[]) {
  const seen = new Set<string>();
  return projects.filter((project) => {
    if (seen.has(project.id)) {
      return false;
    }
    seen.add(project.id);
    return true;
  });
}
