import type { KnowledgeChunk } from "../knowledge/types";
import type { JobProfile } from "./types";
import { normalizeJobProfile } from "./job-profile";

function pushChunk(
  chunks: KnowledgeChunk[],
  options: {
    key: string;
    section: string;
    text: string;
    company?: string;
    role?: string;
    dateRange?: string;
  },
) {
  const text = options.text.trim();
  if (!text) {
    return;
  }
  const evidenceId = `job-profile:${options.key}`;
  chunks.push({
    id: evidenceId,
    evidenceId,
    title: "求职档案",
    text,
    path: ".data/profile/job-profile.json",
    kind: "structured",
    section: options.section,
    status: "published",
    isDemo: false,
    knowledgeSpace: "job",
    documentId: "job-profile",
    sourceName: "求职档案",
    sourceType: "structured",
    contentType: "resume",
    company: options.company || undefined,
    role: options.role || undefined,
    dateRange: options.dateRange || undefined,
  });
}

/** Convert structured Job Profile into searchable Evidence chunks. */
export function jobProfileToKnowledgeChunks(profile: JobProfile): KnowledgeChunk[] {
  const p = normalizeJobProfile(profile);
  const chunks: KnowledgeChunk[] = [];

  const basics = [
    p.name ? `姓名：${p.name}` : "",
    p.english_name ? `英文名：${p.english_name}` : "",
    p.email ? `邮箱：${p.email}` : "",
    p.phone ? `电话：${p.phone}` : "",
    p.location ? `所在地：${p.location}` : "",
    p.target_roles ? `目标岗位：${p.target_roles}` : "",
    p.github ? `GitHub：${p.github}` : "",
    p.portfolio ? `作品集：${p.portfolio}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  pushChunk(chunks, { key: "basics", section: "基本信息", text: basics });

  p.education.forEach((entry, index) => {
    const text = [
      entry.school ? `学校：${entry.school}` : "",
      entry.degree ? `学历：${entry.degree}` : "",
      entry.major ? `专业：${entry.major}` : "",
      entry.date_range ? `时间：${entry.date_range}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    pushChunk(chunks, {
      key: `education-${index}`,
      section: `教育经历 · ${entry.school || index + 1}`,
      text,
    });
  });

  p.internships.forEach((intern, index) => {
    const header = [
      intern.company ? `公司：${intern.company}` : "",
      intern.role ? `岗位：${intern.role}` : "",
      intern.date_range ? `时间：${intern.date_range}` : "",
      intern.projects.length
        ? `项目：${intern.projects.map((project) => project.project_name).filter(Boolean).join("、")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    pushChunk(chunks, {
      key: `internship-${index}`,
      section: `实习经历 · ${intern.company || index + 1}`,
      text: header,
      company: intern.company,
      role: intern.role,
      dateRange: intern.date_range,
    });

    intern.projects.forEach((project, projectIndex) => {
      const company = project.company || project.institution || intern.company;
      const role = project.role || intern.role;
      const text = [
        project.project_name ? `项目：${project.project_name}` : "",
        company ? `所属公司/机构：${company}` : "",
        role ? `角色：${role}` : "",
        intern.date_range ? `时间：${intern.date_range}` : "",
        project.responsibilities ? `职责：\n${project.responsibilities}` : "",
        project.results ? `结果：\n${project.results}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const slug = (project.project_name || `p${projectIndex}`)
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40);
      pushChunk(chunks, {
        key: `internship-${index}-project-${projectIndex}-${slug || "item"}`,
        section: `项目归属 · ${project.project_name || company || "未命名"}`,
        text,
        company,
        role,
        dateRange: intern.date_range,
      });
    });
  });

  p.projects.forEach((project, index) => {
    const company = project.company || project.institution;
    const text = [
      project.project_name ? `项目：${project.project_name}` : "",
      company ? `所属公司/机构：${company}` : "",
      project.role ? `角色：${project.role}` : "",
      project.responsibilities ? `职责：\n${project.responsibilities}` : "",
      project.results ? `结果：\n${project.results}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    pushChunk(chunks, {
      key: `project-${index}`,
      section: `项目经历 · ${project.project_name || index + 1}`,
      text,
      company,
      role: project.role,
    });
  });

  const skillText = [
    p.skills.product ? `产品：${p.skills.product}` : "",
    p.skills.data ? `数据：${p.skills.data}` : "",
    p.skills.ai ? `AI：${p.skills.ai}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  pushChunk(chunks, { key: "skills", section: "技能", text: skillText });

  if (p.academic.papers.length) {
    pushChunk(chunks, {
      key: "academic-papers",
      section: "学术成果 · 论文",
      text: p.academic.papers.map((item, i) => `${i + 1}. ${item}`).join("\n"),
    });
  }
  if (p.academic.patents.length) {
    pushChunk(chunks, {
      key: "academic-patents",
      section: "学术成果 · 专利",
      text: p.academic.patents.map((item, i) => `${i + 1}. ${item}`).join("\n"),
    });
  }

  return chunks;
}
