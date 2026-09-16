import type {
  JobAcademic,
  JobEducationEntry,
  JobInternshipEntry,
  JobProfile,
  JobProfileDiff,
  JobProjectEntry,
  JobSkills,
} from "./types";
import {
  EMPTY_JOB_ACADEMIC,
  EMPTY_JOB_PROFILE,
  EMPTY_JOB_SKILLS,
} from "./types";
import type { DocumentChunkRecord } from "./types";

function asString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => asString(item))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

/** Prefer human-readable title fields when legacy academic items are objects. */
function asLabeledItem(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return asString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => asLabeledItem(item)).filter(Boolean).join("\n");
  }
  if (!value || typeof value !== "object") {
    return "";
  }
  const row = value as Record<string, unknown>;
  const title =
    asString(row.title) ||
    asString(row.name) ||
    asString(row.paper) ||
    asString(row.patent) ||
    asString(row.项目) ||
    asString(row.名称);
  const extra = [
    asString(row.journal) || asString(row.venue) || asString(row.期刊),
    asString(row.authors) || asString(row.author) || asString(row.署名),
    asString(row.patent_no) ||
      asString(row.patent_number) ||
      asString(row.number) ||
      asString(row.id) ||
      asString(row.专利号),
  ].filter(Boolean);
  if (!title && extra.length === 0) {
    return "";
  }
  return [title, ...extra].filter(Boolean).join(" · ");
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => asLabeledItem(item)).filter(Boolean);
  }
  const text = asLabeledItem(value);
  if (!text) {
    return [];
  }
  return text
    .split(/\n|;|；/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function emptyEducation(): JobEducationEntry {
  return { school: "", degree: "", major: "", date_range: "" };
}

function emptyProject(): JobProjectEntry {
  return {
    project_name: "",
    company: "",
    institution: "",
    role: "",
    responsibilities: "",
    results: "",
  };
}

function emptyInternship(): JobInternshipEntry {
  return { company: "", role: "", date_range: "", projects: [] };
}

function normalizeProject(
  raw: unknown,
  fallbackCompany = "",
  fallbackRole = "",
): JobProjectEntry {
  if (typeof raw === "string") {
    const name = raw.trim();
    return {
      ...emptyProject(),
      project_name: name,
      company: fallbackCompany,
      role: fallbackRole,
      responsibilities: "",
      results: "",
    };
  }
  if (!raw || typeof raw !== "object") {
    return emptyProject();
  }
  const row = raw as Record<string, unknown>;
  const company =
    asString(row.company) ||
    asString(row.institution) ||
    asString(row.org) ||
    fallbackCompany;
  const institution = asString(row.institution);
  const responsibilities =
    asString(row.responsibilities) ||
    asString(row.duties) ||
    asString(row.bullets) ||
    asString(row.description);
  return {
    project_name:
      asString(row.project_name) ||
      asString(row.name) ||
      asString(row.title) ||
      asString(row.project),
    company,
    institution,
    role: asString(row.role) || asString(row.title_role) || fallbackRole,
    responsibilities,
    results: asString(row.results) || asString(row.outcome) || asString(row.achievements),
  };
}

function normalizeEducation(raw: unknown): JobEducationEntry {
  if (typeof raw === "string") {
    return { ...emptyEducation(), school: raw.trim() };
  }
  if (!raw || typeof raw !== "object") {
    return emptyEducation();
  }
  const row = raw as Record<string, unknown>;
  return {
    school: asString(row.school) || asString(row.university) || asString(row.name),
    degree: asString(row.degree) || asString(row.学历),
    major: asString(row.major) || asString(row.专业),
    date_range:
      asString(row.date_range) ||
      asString(row.dates) ||
      asString(row.period) ||
      asString(row.time),
  };
}

function normalizeInternship(raw: unknown): JobInternshipEntry {
  if (typeof raw === "string") {
    return { ...emptyInternship(), company: raw.trim() };
  }
  if (!raw || typeof raw !== "object") {
    return emptyInternship();
  }
  const row = raw as Record<string, unknown>;
  const company = asString(row.company) || asString(row.organization) || asString(row.name);
  const role = asString(row.role) || asString(row.title) || asString(row.position);
  const projectsRaw = row.projects ?? row.project_list ?? row.products;
  const projects = Array.isArray(projectsRaw)
    ? projectsRaw.map((item) => normalizeProject(item, company, role))
    : asString(projectsRaw)
      ? asString(projectsRaw)
          .split(/\n/)
          .map((line) => normalizeProject(line, company, role))
      : [];
  return {
    company,
    role,
    date_range:
      asString(row.date_range) ||
      asString(row.dates) ||
      asString(row.period) ||
      asString(row.time),
    projects: projects.filter(
      (project) =>
        project.project_name ||
        project.responsibilities ||
        project.results ||
        project.role,
    ),
  };
}

function normalizeSkills(raw: unknown): JobSkills {
  if (typeof raw === "string") {
    return { ...EMPTY_JOB_SKILLS, product: raw.trim() };
  }
  if (!raw || typeof raw !== "object") {
    return { ...EMPTY_JOB_SKILLS };
  }
  const row = raw as Record<string, unknown>;
  return {
    product: asString(row.product) || asString(row.产品) || asString(row.product_skills),
    data: asString(row.data) || asString(row.数据) || asString(row.tech) || asString(row.技术),
    ai: asString(row.ai) || asString(row.AI) || asString(row.ai_skills),
  };
}

function normalizeAcademic(raw: unknown): JobAcademic {
  if (!raw || typeof raw !== "object") {
    return { papers: [], patents: [] };
  }
  const row = raw as Record<string, unknown>;
  return {
    papers: asStringList(row.papers ?? row.论文),
    patents: asStringList(row.patents ?? row.专利),
  };
}

function readContact(row: Record<string, unknown>): Record<string, unknown> {
  if (row.contact && typeof row.contact === "object" && !Array.isArray(row.contact)) {
    return row.contact as Record<string, unknown>;
  }
  return {};
}

/**
 * Normalize unknown / legacy / external JSON into the canonical JobProfile shape.
 * Empty fields stay empty — never invent values.
 */
export function normalizeJobProfile(input: unknown): JobProfile {
  if (!input || typeof input !== "object") {
    return structuredClone(EMPTY_JOB_PROFILE);
  }
  const row = input as Record<string, unknown>;
  const contact = readContact(row);

  const educationRaw = row.education ?? row.educations ?? row.education_history;
  const education = Array.isArray(educationRaw)
    ? educationRaw.map(normalizeEducation)
    : typeof educationRaw === "string" && educationRaw.trim()
      ? [normalizeEducation(educationRaw)]
      : [];

  // ChatGPT legacy exports use `experience`; newer schema uses `internships`.
  const internshipsRaw =
    row.internships ??
    row.experience ??
    row.experiences ??
    row.work_experience ??
    row.internship;
  const internships = Array.isArray(internshipsRaw)
    ? internshipsRaw.map(normalizeInternship)
    : [];

  const projectsRaw = row.projects ?? row.standalone_projects;
  let projects: JobProjectEntry[] = [];
  // When legacy payload already mapped experience→internships, a top-level
  // string[] "projects" is usually redundant names — only keep object rows or
  // strings when there is no internship list.
  if (Array.isArray(projectsRaw)) {
    const hasObjectProjects = projectsRaw.some(
      (item) => item && typeof item === "object" && !Array.isArray(item),
    );
    if (hasObjectProjects) {
      projects = projectsRaw.map((item) => normalizeProject(item));
    } else if (internships.length === 0) {
      projects = projectsRaw.map((item) => normalizeProject(item));
    }
  } else if (typeof projectsRaw === "string" && projectsRaw.trim()) {
    projects = [
      {
        ...emptyProject(),
        responsibilities: projectsRaw.trim(),
      },
    ];
  }

  return {
    name: asString(row.name) || asString(row.姓名),
    english_name: asString(row.english_name) || asString(row.englishName) || asString(row.英文名),
    email:
      asString(row.email) ||
      asString(contact.email) ||
      asString(row.邮箱) ||
      asString(contact.邮箱),
    phone:
      asString(row.phone) ||
      asString(contact.phone) ||
      asString(row.电话) ||
      asString(row.mobile) ||
      asString(contact.mobile) ||
      asString(contact.电话),
    location:
      asString(row.location) ||
      asString(contact.location) ||
      asString(row.所在地) ||
      asString(row.city) ||
      asString(contact.city) ||
      asString(contact.所在地),
    target_roles:
      asString(row.target_roles) ||
      asString(row.targetRoles) ||
      asString(row.目标岗位) ||
      asString(row.target_role),
    github: asString(row.github) || asString(contact.github),
    portfolio: asString(row.portfolio) || asString(row.作品集),
    education: education.filter((entry) => entry.school || entry.major || entry.degree || entry.date_range),
    internships: internships.filter(
      (entry) => entry.company || entry.role || entry.date_range || entry.projects.length > 0,
    ),
    projects: projects.filter(
      (entry) =>
        entry.project_name ||
        entry.responsibilities ||
        entry.results ||
        entry.company ||
        entry.institution,
    ),
    skills: normalizeSkills(row.skills),
    academic: normalizeAcademic(row.academic ?? row.学术成果),
  };
}

export function isJobProfileEmpty(profile: JobProfile): boolean {
  const p = normalizeJobProfile(profile);
  if (
    p.name ||
    p.english_name ||
    p.email ||
    p.phone ||
    p.location ||
    p.target_roles ||
    p.github ||
    p.portfolio
  ) {
    return false;
  }
  if (p.education.length || p.internships.length || p.projects.length) {
    return false;
  }
  if (p.skills.product || p.skills.data || p.skills.ai) {
    return false;
  }
  if (p.academic.papers.length || p.academic.patents.length) {
    return false;
  }
  return true;
}

function stringifyValue(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function collectPaths(
  value: unknown,
  prefix: string,
  out: Map<string, string>,
): void {
  if (value == null) {
    out.set(prefix || "(root)", "");
    return;
  }
  if (typeof value !== "object") {
    out.set(prefix, stringifyValue(value));
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.set(prefix, "[]");
      return;
    }
    value.forEach((item, index) => {
      collectPaths(item, `${prefix}[${index}]`, out);
    });
    return;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    out.set(prefix, "{}");
    return;
  }
  for (const [key, child] of entries) {
    const next = prefix ? `${prefix}.${key}` : key;
    collectPaths(child, next, out);
  }
}

/** Field-level diff for import confirmation UI. */
export function diffJobProfiles(
  current: JobProfile,
  incoming: JobProfile,
): JobProfileDiff[] {
  const before = new Map<string, string>();
  const after = new Map<string, string>();
  collectPaths(normalizeJobProfile(current), "", before);
  collectPaths(normalizeJobProfile(incoming), "", after);
  const keys = new Set([...before.keys(), ...after.keys()]);
  const diffs: JobProfileDiff[] = [];
  for (const path of [...keys].sort()) {
    const left = before.get(path) ?? "";
    const right = after.get(path) ?? "";
    if (left === right) {
      continue;
    }
    diffs.push({ path: path || "(root)", before: left, after: right });
  }
  return diffs;
}

export type JobProfileImportResult = {
  profile: JobProfile;
  warnings: string[];
};

/** Parse an external JSON value into a JobProfile without writing disk. */
export function parseJobProfileImport(raw: unknown): JobProfileImportResult {
  const warnings: string[] = [];
  if (raw == null) {
    warnings.push("导入内容为空。");
    return { profile: structuredClone(EMPTY_JOB_PROFILE), warnings };
  }
  let payload: unknown = raw;
  if (typeof raw === "string") {
    try {
      payload = JSON.parse(raw) as unknown;
    } catch {
      warnings.push("JSON 解析失败。");
      return { profile: structuredClone(EMPTY_JOB_PROFILE), warnings };
    }
  }
  if (!payload || typeof payload !== "object") {
    warnings.push("导入内容必须是 JSON 对象。");
    return { profile: structuredClone(EMPTY_JOB_PROFILE), warnings };
  }
  const root = payload as Record<string, unknown>;
  // Allow wrappers: { profile: {...} } or { job_profile: {...} }
  const wrapped =
    root.profile && typeof root.profile === "object" && !Array.isArray(root.profile)
      ? root.profile
      : root.job_profile && typeof root.job_profile === "object" && !Array.isArray(root.job_profile)
        ? root.job_profile
        : payload;
  const profile = normalizeJobProfile(wrapped);
  if (isJobProfileEmpty(profile)) {
    warnings.push("解析后档案为空，请检查字段名是否匹配。");
  }
  return { profile, warnings };
}

/** Authoritative company → project_name map from structured profile. */
export function profileProjectAffiliations(
  profile: JobProfile,
): Array<{ company: string; role: string; date_range: string; project_name: string }> {
  const p = normalizeJobProfile(profile);
  const rows: Array<{
    company: string;
    role: string;
    date_range: string;
    project_name: string;
  }> = [];
  for (const intern of p.internships) {
    for (const project of intern.projects) {
      if (!project.project_name.trim()) {
        continue;
      }
      rows.push({
        company: intern.company || project.company || project.institution,
        role: project.role || intern.role,
        date_range: intern.date_range,
        project_name: project.project_name,
      });
    }
  }
  for (const project of p.projects) {
    if (!project.project_name.trim()) {
      continue;
    }
    rows.push({
      company: project.company || project.institution,
      role: project.role,
      date_range: "",
      project_name: project.project_name,
    });
  }
  return rows;
}

/**
 * Soft conflict hints when uploaded resume metadata claims a different company
 * for a project that Job Profile maps elsewhere. Never auto-overwrites.
 */
export function detectProfileResumeConflicts(
  profile: JobProfile,
  chunks: DocumentChunkRecord[],
): string[] {
  const affiliations = profileProjectAffiliations(profile);
  if (affiliations.length === 0) {
    return [];
  }
  const byProject = new Map(
    affiliations.map((row) => [row.project_name.toLowerCase(), row.company] as const),
  );
  const hints: string[] = [];
  const seen = new Set<string>();

  for (const chunk of chunks) {
    if (chunk.content_type !== "resume") {
      continue;
    }
    if (!chunk.company?.trim() || chunk.affiliation_unknown) {
      continue;
    }
    const content = chunk.content ?? "";
    for (const [projectName, profileCompany] of byProject) {
      if (!projectName || !content.toLowerCase().includes(projectName)) {
        continue;
      }
      if (!profileCompany) {
        continue;
      }
      if (chunk.company.includes(profileCompany) || profileCompany.includes(chunk.company)) {
        continue;
      }
      const key = `${projectName}::${chunk.company}::${profileCompany}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      hints.push(
        `项目「${affiliations.find((a) => a.project_name.toLowerCase() === projectName)?.project_name ?? projectName}」：结构化档案归属「${profileCompany}」，上传简历片段标注「${chunk.company}」。结构化档案与原始资料存在差异，请人工确认。`,
      );
    }
  }
  return hints;
}

export function formatInternshipSummary(entry: JobInternshipEntry): string {
  const header = [entry.company, entry.role, entry.date_range].filter(Boolean).join(" · ");
  const projects = entry.projects
    .map((project) => {
      const bits = [
        project.project_name ? `项目：${project.project_name}` : "",
        project.responsibilities,
        project.results ? `结果：${project.results}` : "",
      ].filter(Boolean);
      return bits.join("\n");
    })
    .filter(Boolean);
  return [header, ...projects].filter(Boolean).join("\n");
}

export { EMPTY_JOB_PROFILE, EMPTY_JOB_SKILLS, EMPTY_JOB_ACADEMIC };
