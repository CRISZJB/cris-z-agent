export type ContentType = "general" | "resume";

export type ResumeSectionType =
  | "basics"
  | "education"
  | "experience"
  | "experience_detail"
  | "project"
  | "skills"
  | "other";

export type ResumeChunkMeta = {
  section_type: ResumeSectionType;
  company?: string;
  role?: string;
  date_range?: string;
  school?: string;
  degree?: string;
  major?: string;
  /** True when duties/projects cannot be reliably bound to a company/role. */
  affiliation_unknown?: boolean;
};

export type StructuredChunk = {
  section: string;
  content: string;
  index: number;
  meta?: ResumeChunkMeta;
};

const DATE_RANGE =
  "(\\d{4}\\s*[-./年]\\s*\\d{1,2}(?:\\s*[-./月]\\s*\\d{1,2})?\\s*[~～\\-—至到]+\\s*(?:\\d{4}\\s*[-./年]\\s*\\d{1,2}(?:\\s*[-./月]\\s*\\d{1,2})?|至今|现在))";

const SECTION_LABELS: Array<{ pattern: RegExp; type: ResumeSectionType | "marker" }> = [
  { pattern: /^(基本信息|个人简历)$/, type: "basics" },
  { pattern: /^教育背景$/, type: "marker" },
  { pattern: /^(实习经验|工作经历|工作经验)$/, type: "marker" },
  { pattern: /^项目经验$/, type: "marker" },
  { pattern: /^(技能特长|专业技能|技能)$/, type: "skills" },
  { pattern: /^(自我评价|个人评价)$/, type: "other" },
  { pattern: /^(学术成就|专利情况|论文)/, type: "other" },
];

/**
 * Resume-aware chunking for common Chinese resume text.
 * Never invents company/role affiliation when the extracted text is ambiguous
 * (e.g. consecutive headers then a shared bullet pool from PDF column order).
 */
export function chunkResumeText(text: string): StructuredChunk[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const lines = normalized
    .split("\n")
    .map((line) => line.replace(/\u00a0/g, " ").trimEnd())
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^--\s*\d+\s*of\s*\d+\s*--$/i.test(line));

  const blocks: Array<{
    section: string;
    contentLines: string[];
    meta: ResumeChunkMeta;
  }> = [];

  let mode: "education" | "experience" | "skills" | "other" | "basics" = "basics";
  let pendingHeaders: Array<{
    raw: string;
    date_range: string;
    org: string;
    title: string;
  }> = [];
  let detailLines: string[] = [];

  const flushDetails = () => {
    if (detailLines.length === 0) {
      return;
    }
    if (pendingHeaders.length === 1) {
      const header = pendingHeaders[0]!;
      const meta = metaFromHeader(mode, header);
      blocks.push({
        section: sectionLabel(meta),
        contentLines: [header.raw, ...detailLines],
        meta,
      });
      pendingHeaders = [];
    } else {
      if (pendingHeaders.length > 1) {
        for (const header of pendingHeaders) {
          const meta = metaFromHeader(mode, header);
          blocks.push({
            section: sectionLabel(meta),
            contentLines: [header.raw],
            meta,
          });
        }
        pendingHeaders = [];
      }
      blocks.push({
        section:
          mode === "education"
            ? "教育经历细节（原文未标明所属条目）"
            : "工作经历细节（原文未标明所属公司）",
        contentLines: [...detailLines],
        meta: {
          section_type: mode === "education" ? "education" : "experience_detail",
          affiliation_unknown: true,
        },
      });
    }
    detailLines = [];
  };

  const flushPendingHeadersOnly = () => {
    for (const header of pendingHeaders) {
      const meta = metaFromHeader(mode, header);
      blocks.push({
        section: sectionLabel(meta),
        contentLines: [header.raw],
        meta,
      });
    }
    pendingHeaders = [];
  };

  for (const line of lines) {
    const sectionHit = SECTION_LABELS.find((item) => item.pattern.test(line));
    if (sectionHit) {
      if (mode === "skills" && detailLines.length > 0) {
        blocks.push({
          section: "技能特长",
          contentLines: [...detailLines],
          meta: { section_type: "skills" },
        });
        detailLines = [];
      } else {
        flushDetails();
      }
      flushPendingHeadersOnly();
      if (/^教育背景$/.test(line)) {
        mode = "education";
        continue;
      }
      if (/^(实习经验|工作经历|工作经验|项目经验)$/.test(line)) {
        mode = "experience";
        continue;
      }
      if (/^(技能特长|专业技能|技能)$/.test(line)) {
        mode = "skills";
        continue;
      }
      if (/^(基本信息|个人简历)$/.test(line)) {
        mode = "basics";
        continue;
      }
      mode = "other";
      continue;
    }

    const header = parseHeaderLine(line);
    if (header && (mode === "education" || mode === "experience" || mode === "basics")) {
      // Heuristic mode switch: education-like titles vs internship roles.
      if (/(本科|硕士|博士|专业)/.test(header.title) || /(大学|学院|理工)/.test(header.org)) {
        if (mode === "basics") {
          mode = "education";
        }
      } else if (/(实习|经理|助理|工程师|测试|产品)/.test(header.title)) {
        if (mode === "basics" || mode === "education") {
          // May still be education practice; only switch if clearly company-like.
          if (/(公司|科技|物联|网联)/.test(header.org)) {
            mode = "experience";
          }
        }
      }

      if (detailLines.length > 0) {
        flushDetails();
      }
      pendingHeaders.push(header);
      continue;
    }

    if (mode === "skills") {
      flushPendingHeadersOnly();
      detailLines.push(line);
      continue;
    }

    if (isBulletOrProjectLine(line) || pendingHeaders.length > 0) {
      detailLines.push(line);
      continue;
    }

    // Loose text: attach to open details or create other block.
    if (pendingHeaders.length > 0 || detailLines.length > 0) {
      detailLines.push(line);
    } else {
      blocks.push({
        section: mode === "basics" ? "基本信息" : "其他",
        contentLines: [line],
        meta: { section_type: mode === "basics" ? "basics" : "other" },
      });
    }
  }

  flushDetails();
  flushPendingHeadersOnly();

  if (mode === "skills" && detailLines.length > 0) {
    blocks.push({
      section: "技能特长",
      contentLines: [...detailLines],
      meta: { section_type: "skills" },
    });
    detailLines = [];
  }

  // Merge trailing skills-like bullets if captured as experience_detail mistakenly.
  const result: StructuredChunk[] = [];
  let index = 0;
  for (const block of blocks) {
    const content = block.contentLines.join("\n").trim();
    if (!content) {
      continue;
    }
    index += 1;
    result.push({
      section: block.section,
      content,
      index,
      meta: block.meta,
    });
  }

  return result;
}

function parseHeaderLine(line: string): { raw: string; date_range: string; org: string; title: string } | null {
  const tabParts = line.split(/\t+/).map((part) => part.trim()).filter(Boolean);
  if (tabParts.length >= 3 && /^\d{4}/.test(tabParts[0] ?? "")) {
    return {
      raw: line,
      date_range: tabParts[0]!,
      org: tabParts[1]!,
      title: tabParts.slice(2).join(" "),
    };
  }

  const spaced = line.match(
    new RegExp(`^${DATE_RANGE}\\s{2,}(.+?)\\s{2,}(.+)$`),
  );
  if (spaced) {
    return {
      raw: line,
      date_range: spaced[1]!.replace(/\s+/g, " ").trim(),
      org: spaced[2]!.trim(),
      title: spaced[3]!.trim(),
    };
  }

  return null;
}

function metaFromHeader(
  mode: "education" | "experience" | "skills" | "other" | "basics",
  header: { date_range: string; org: string; title: string },
): ResumeChunkMeta {
  if (mode === "education" || /(本科|硕士|博士|专业)/.test(header.title)) {
    return {
      section_type: "education",
      school: header.org,
      major: header.title,
      date_range: header.date_range,
    };
  }
  return {
    section_type: "experience",
    company: header.org,
    role: header.title,
    date_range: header.date_range,
  };
}

function sectionLabel(meta: ResumeChunkMeta): string {
  if (meta.section_type === "education") {
    return [meta.school, meta.major].filter(Boolean).join(" · ") || "教育经历";
  }
  if (meta.section_type === "experience") {
    return [meta.company, meta.role].filter(Boolean).join(" · ") || "工作经历";
  }
  if (meta.section_type === "skills") {
    return "技能特长";
  }
  if (meta.section_type === "experience_detail") {
    return "工作经历细节（原文未标明所属公司）";
  }
  return "简历片段";
}

export function isAffiliationUnknownMeta(meta?: ResumeChunkMeta | null): boolean {
  if (!meta) {
    return false;
  }
  if (meta.affiliation_unknown) {
    return true;
  }
  return meta.section_type === "experience_detail" && !meta.company;
}

function isBulletOrProjectLine(line: string) {
  return (
    /^[-•·●*]/.test(line) ||
    /^项目[一二三四五六七八九十\d]+[：:]/.test(line) ||
    /^[0-9]+[、.]/.test(line)
  );
}

export function parseContentType(value: unknown): ContentType {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return raw === "resume" ? "resume" : "general";
}
