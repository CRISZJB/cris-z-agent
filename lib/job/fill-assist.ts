import type {
  JobEducationEntry,
  JobInternshipEntry,
  JobProfile,
  JobProjectEntry,
} from "../documents/types";
import { normalizeJobProfile } from "../documents/job-profile";

export const FILL_MISSING = "[需要人工补充]";

export type FillFieldType = "fact" | "generated";

export type FillFieldResult = {
  field: string;
  type: FillFieldType;
  value: string;
};

const GENERATED_HINTS = [
  /自我介绍/,
  /为什么申请/,
  /申请理由/,
  /个人优势/,
  /岗位匹配/,
  /匹配说明/,
  /盖章信/,
  /推荐信/,
];

const FULL_EDUCATION_HINTS = [/教育经历/, /完整教育/, /全部教育/, /学历经历/];
const FULL_PROJECT_HINTS = [/完整项目/, /全部项目/, /所有项目经历/];

function degreeRank(degree: string): number {
  if (/博士|phd/i.test(degree)) return 4;
  if (/硕士|研究生|master/i.test(degree)) return 3;
  if (/本科|学士|bachelor/i.test(degree)) return 2;
  if (/专科|大专/i.test(degree)) return 1;
  return 0;
}

/** Parse end date from ranges like `2025-09 ~ 2026-10` or `2026-08 ~ 至今`. */
export function parseRangeEnd(dateRange: string): { sortKey: number; display: string } {
  const raw = dateRange.trim();
  if (!raw) {
    return { sortKey: 0, display: "" };
  }
  if (/至今|现在|present/i.test(raw)) {
    return { sortKey: 9_999_99, display: "至今" };
  }
  const monthHits = [...raw.matchAll(/(\d{4})\s*[.\-/年]\s*(\d{1,2})/g)];
  if (monthHits.length > 0) {
    const last = monthHits[monthHits.length - 1]!;
    const year = Number(last[1]);
    const month = Number(last[2]);
    return {
      sortKey: year * 100 + month,
      display: `${year}-${String(month).padStart(2, "0")}`,
    };
  }
  const yearHits = [...raw.matchAll(/\b(\d{4})\b/g)];
  if (yearHits.length > 0) {
    const year = Number(yearHits[yearHits.length - 1]![1]);
    return { sortKey: year * 100 + 12, display: String(year) };
  }
  return { sortKey: 0, display: raw };
}

export function pickHighestEducation(education: JobEducationEntry[]): JobEducationEntry | null {
  if (education.length === 0) {
    return null;
  }
  return [...education].sort((a, b) => {
    const degreeDiff = degreeRank(b.degree) - degreeRank(a.degree);
    if (degreeDiff !== 0) {
      return degreeDiff;
    }
    return parseRangeEnd(b.date_range).sortKey - parseRangeEnd(a.date_range).sortKey;
  })[0]!;
}

export function pickLatestInternship(
  internships: JobInternshipEntry[],
): JobInternshipEntry | null {
  if (internships.length === 0) {
    return null;
  }
  return [...internships].sort(
    (a, b) => parseRangeEnd(b.date_range).sortKey - parseRangeEnd(a.date_range).sortKey,
  )[0]!;
}

function projectAiScore(project: JobProjectEntry): number {
  const hay = `${project.project_name}\n${project.responsibilities}\n${project.results}`;
  let score = 0;
  if (/国信|智会|密盒|Agent|ASR|AI|智能|LLM|大模型|转写|会议/i.test(hay)) score += 5;
  if (/I-Park|园区|边缘计算|南网|电网/i.test(hay)) score += 3;
  if (/机械臂|测试/.test(hay)) score += 1;
  if (project.responsibilities.trim() || project.results.trim()) score += 1;
  return score;
}

function firstSentences(text: string, max = 2): string {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/^[-•*\d.、)\s]+/, "").trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return "";
  }
  return lines.slice(0, max).join("；");
}

function formatProjectLine(
  project: JobProjectEntry,
  company?: string,
): string {
  const name = project.project_name || "未命名项目";
  const org = company || project.company || project.institution;
  const detail =
    firstSentences(project.responsibilities, 2) ||
    firstSentences(project.results, 1);
  if (detail) {
    return org ? `${name}（${org}）：${detail}` : `${name}：${detail}`;
  }
  return org ? `${name}（${org}）` : name;
}

export function collectProfileProjects(profile: JobProfile): Array<{
  project: JobProjectEntry;
  company: string;
  role: string;
}> {
  const p = normalizeJobProfile(profile);
  const rows: Array<{ project: JobProjectEntry; company: string; role: string }> = [];
  for (const intern of p.internships) {
    for (const project of intern.projects) {
      rows.push({
        project,
        company: project.company || intern.company,
        role: project.role || intern.role,
      });
    }
  }
  for (const project of p.projects) {
    rows.push({
      project,
      company: project.company || project.institution,
      role: project.role,
    });
  }
  return rows;
}

export function formatCompactProjects(
  profile: JobProfile,
  options?: { full?: boolean; limit?: number },
): string {
  const rows = collectProfileProjects(profile);
  if (rows.length === 0) {
    return FILL_MISSING;
  }
  const full = Boolean(options?.full);
  const limit = options?.limit ?? 3;
  const selected = full
    ? rows
    : [...rows]
        .sort((a, b) => projectAiScore(b.project) - projectAiScore(a.project))
        .slice(0, Math.min(limit, rows.length));

  return selected
    .map((row, index) => `${index + 1}. ${formatProjectLine(row.project, row.company)}`)
    .join("\n");
}

export function formatFullEducation(education: JobEducationEntry[]): string {
  if (education.length === 0) {
    return FILL_MISSING;
  }
  return education
    .map((entry) =>
      [entry.school, entry.degree, entry.major, entry.date_range].filter(Boolean).join("｜"),
    )
    .join("\n");
}

/** Strip markdown markers / common escape noise for copy-paste into job forms. */
export function toPlainText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\\([~.`*_\-\[\]()#>\\])/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseRequestedFields(fieldsText: string): string[] {
  const lines = fieldsText.replace(/\r\n/g, "\n").split("\n");
  const fields: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const match = trimmed.match(/^([^：:\n]{1,40})\s*[：:]\s*(.*)$/);
    if (match) {
      const label = match[1]!.trim();
      if (label) {
        fields.push(label);
      }
      continue;
    }
    if (/^[（(]?可选/.test(trimmed)) {
      continue;
    }
    // Bare labels without colon
    if (trimmed.length <= 20 && !/[。！？]/.test(trimmed)) {
      fields.push(trimmed.replace(/[：:]\s*$/, ""));
    }
  }
  // de-dupe preserving order
  const seen = new Set<string>();
  return fields.filter((field) => {
    if (seen.has(field)) {
      return false;
    }
    seen.add(field);
    return true;
  });
}

export function isGeneratedField(field: string): boolean {
  return GENERATED_HINTS.some((pattern) => pattern.test(field));
}

export function wantsFullEducation(field: string, allFields: string[]): boolean {
  if (FULL_EDUCATION_HINTS.some((pattern) => pattern.test(field))) {
    return true;
  }
  return allFields.some((item) => FULL_EDUCATION_HINTS.some((pattern) => pattern.test(item)));
}

export function wantsFullProjects(field: string, allFields: string[]): boolean {
  if (FULL_PROJECT_HINTS.some((pattern) => pattern.test(field))) {
    return true;
  }
  return allFields.some((item) => FULL_PROJECT_HINTS.some((pattern) => pattern.test(item)));
}

function orMissing(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : FILL_MISSING;
}

export function buildGenericApplicationReason(profile: JobProfile): string {
  const p = normalizeJobProfile(profile);
  const target = p.target_roles.trim() || "AI 产品经理";
  const latest = pickLatestInternship(p.internships);
  const projects = collectProfileProjects(p)
    .sort((a, b) => projectAiScore(b.project) - projectAiScore(a.project))
    .slice(0, 2)
    .map((row) => row.project.project_name)
    .filter(Boolean);

  const parts = [
    `以下为面向「${target}」方向的通用申请理由（未提供具体 JD，不含特定公司表述）：`,
    `我希望从事${target}相关工作，关注真实用户问题、产品方案与 AI 能力落地。`,
  ];
  if (latest?.company) {
    parts.push(
      `近期在${latest.company}担任${latest.role || "相关岗位"}，参与过${projects.join("、") || "AI 相关产品"}等工作。`,
    );
  } else if (projects.length > 0) {
    parts.push(`我在${projects.join("、")}等项目中积累了需求分析、方案梳理与效果评测经验。`);
  }
  parts.push("若贵团队有具体岗位说明，我可以再按 JD 补充针对性匹配说明。");
  // Avoid 贵公司 / 这个岗位 as primary framing; last line mentions 贵团队 only as optional follow-up.
  // User asked not to write 贵公司/这个岗位 — rewrite last line.
  parts[parts.length - 1] =
    "如后续提供具体岗位 JD，我可以再补充针对性的匹配说明。";
  return parts.join("");
}

export function buildSelfIntroDraft(profile: JobProfile): string {
  const p = normalizeJobProfile(profile);
  const edu = pickHighestEducation(p.education);
  const latest = pickLatestInternship(p.internships);
  const target = p.target_roles.trim() || "AI 产品经理";
  const bits = [
    p.name ? `我是${p.name}` : "我是一名求职者",
    edu?.school ? `，最高学历就读于${edu.school}` : "",
    edu?.major ? `，专业为${edu.major}` : "",
    edu?.degree ? `（${edu.degree}）` : "",
    "。",
    latest?.company
      ? `近期在${latest.company}担任${latest.role || "实习生"}。`
      : "",
    `希望应聘${target}方向，擅长把用户反馈与评测结果转化为可落地的产品改进。`,
  ];
  return bits.join("");
}

/**
 * Fill requested form fields from structured Job Profile.
 * Fact fields are deterministic; generated fields may be filled by caller overrides.
 */
export function fillJobFormFields(options: {
  profile: JobProfile;
  fieldsText: string;
  jdText?: string;
  generatedValues?: Record<string, string>;
}): FillFieldResult[] {
  const profile = normalizeJobProfile(options.profile);
  const fields = parseRequestedFields(options.fieldsText);
  const generatedValues = options.generatedValues ?? {};
  const hasJd = Boolean(options.jdText?.trim());
  const highest = pickHighestEducation(profile.education);
  const latest = pickLatestInternship(profile.internships);
  const fullEducation = fields.some((field) =>
    FULL_EDUCATION_HINTS.some((pattern) => pattern.test(field)),
  );
  const fullProjects = fields.some((field) =>
    FULL_PROJECT_HINTS.some((pattern) => pattern.test(field)),
  );

  return fields.map((field) => {
    if (isGeneratedField(field)) {
      const override = generatedValues[field];
      let value = override ? toPlainText(override) : "";
      if (!value) {
        if (/为什么申请|申请理由/.test(field)) {
          value = hasJd
            ? FILL_MISSING
            : toPlainText(buildGenericApplicationReason(profile));
        } else if (/自我介绍/.test(field)) {
          value = toPlainText(buildSelfIntroDraft(profile));
        } else {
          value = FILL_MISSING;
        }
      }
      if (!hasJd && /贵公司|这个岗位/.test(value) && /为什么申请|申请理由/.test(field)) {
        value = toPlainText(buildGenericApplicationReason(profile));
      }
      return { field, type: "generated" as const, value };
    }

    // Fact fields
    let value = FILL_MISSING;
    if (/姓名|名字/.test(field)) {
      value = orMissing(profile.name);
    } else if (/英文名/.test(field)) {
      value = orMissing(profile.english_name);
    } else if (/邮箱|email/i.test(field)) {
      value = orMissing(profile.email);
    } else if (/电话|手机|phone/i.test(field)) {
      value = orMissing(profile.phone);
    } else if (/地点|所在地|城市|现居/.test(field)) {
      value = orMissing(profile.location);
    } else if (/目标岗位/.test(field)) {
      value = orMissing(profile.target_roles);
    } else if (FULL_EDUCATION_HINTS.some((pattern) => pattern.test(field))) {
      value = formatFullEducation(profile.education);
    } else if (/^学校$|院校|毕业院校/.test(field)) {
      value = orMissing(highest?.school);
    } else if (/专业/.test(field)) {
      value = orMissing(highest?.major);
    } else if (/学历|学位/.test(field)) {
      value = orMissing(highest?.degree);
    } else if (/毕业时间|毕业年份|在读时间/.test(field)) {
      value = highest ? orMissing(parseRangeEnd(highest.date_range).display) : FILL_MISSING;
    } else if (/最近一段实习|最近实习|近期实习/.test(field)) {
      if (!latest) {
        value = FILL_MISSING;
      } else {
        value = [latest.company, latest.role, latest.date_range].filter(Boolean).join("｜");
      }
    } else if (/^公司$|实习公司|就职公司/.test(field)) {
      value = orMissing(latest?.company);
    } else if (/^岗位$|职位|实习岗位|职务/.test(field)) {
      value = orMissing(latest?.role);
    } else if (/项目经历|项目经验/.test(field)) {
      value = formatCompactProjects(profile, { full: fullProjects, limit: 3 });
    } else if (/教育/.test(field)) {
      value = fullEducation
        ? formatFullEducation(profile.education)
        : formatFullEducation(highest ? [highest] : []);
    } else {
      value = FILL_MISSING;
    }

    return { field, type: "fact" as const, value: toPlainText(value) };
  });
}

export function fieldsToPlainAnswer(fields: FillFieldResult[]): string {
  return fields.map((item) => `${item.field}：\n${item.value}`).join("\n\n");
}
