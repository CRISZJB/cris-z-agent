import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import example from "../../../fixtures/job-profile.example.json";
import legacyChatgpt from "../../../fixtures/job-profile.legacy-chatgpt.json";
import {
  detectProfileResumeConflicts,
  diffJobProfiles,
  isJobProfileEmpty,
  normalizeJobProfile,
  parseJobProfileImport,
  profileProjectAffiliations,
} from "../job-profile";
import { jobProfileToKnowledgeChunks } from "../job-profile-evidence";
import { EMPTY_JOB_PROFILE } from "../types";
import type { DocumentChunkRecord } from "../types";

describe("structured job profile", () => {
  it("loads the anonymous fixture with company—project affiliations", () => {
    const profile = normalizeJobProfile(example);
    expect(profile.name).toBe("张三");
    expect(profile.email).toBe("example@example.com");
    expect(profile.phone).toBe("");
    expect(profile.internships).toHaveLength(2);

    const affiliations = profileProjectAffiliations(profile);
    expect(affiliations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ project_name: "项目 Alpha", company: "公司 A" }),
        expect.objectContaining({ project_name: "项目 Beta", company: "公司 B" }),
        expect.objectContaining({ project_name: "项目 Gamma", company: "公司 B" }),
      ]),
    );
  });

  it("keeps empty fields empty and does not invent values", () => {
    const profile = normalizeJobProfile({
      name: "张三",
      phone: "",
      education: [],
      internships: [
        {
          company: "公司 A",
          role: "实习生",
          date_range: "2023",
          projects: [{ project_name: "项目 Alpha", results: "" }],
        },
      ],
    });
    expect(profile.phone).toBe("");
    expect(profile.english_name).toBe("");
    expect(profile.internships[0]?.projects[0]?.results).toBe("");
    expect(profile.academic.patents).toEqual([]);
  });

  it("parses import JSON and supports preview diffs without auto-overwrite semantics", () => {
    const current = normalizeJobProfile({
      name: "旧名",
      internships: [
        {
          company: "旧公司",
          role: "旧岗位",
          date_range: "2020",
          projects: [{ project_name: "旧项目", company: "旧公司" }],
        },
      ],
    });
    const imported = parseJobProfileImport(example);
    expect(imported.warnings.length).toBe(0);
    expect(isJobProfileEmpty(current)).toBe(false);
    expect(isJobProfileEmpty(imported.profile)).toBe(false);

    const diffs = diffJobProfiles(current, imported.profile);
    expect(diffs.some((diff) => diff.path.includes("name"))).toBe(true);
    expect(diffs.some((diff) => diff.after.includes("张三") || diff.path === "name")).toBe(
      true,
    );
    // Import commit requires explicit confirm when current is non-empty — enforced by API;
    // here we only assert diff is non-empty so UI can require confirmation.
    expect(diffs.length).toBeGreaterThan(0);
  });

  it("accepts legacy flat schema on read", () => {
    const profile = normalizeJobProfile({
      name: "张三",
      education: "示例大学 · 计算机",
      projects: "做过项目 Alpha",
      skills: "PRD",
      target_roles: "产品经理",
    });
    expect(profile.education[0]?.school).toContain("示例大学");
    expect(profile.projects[0]?.responsibilities).toContain("项目 Alpha");
    expect(profile.skills.product).toContain("PRD");
  });

  it("emits structured evidence that preserves company/project relations", () => {
    const chunks = jobProfileToKnowledgeChunks(normalizeJobProfile(example));
    const alpha = chunks.find(
      (chunk) => chunk.section.includes("项目归属") && chunk.text.includes("项目 Alpha"),
    );
    const beta = chunks.find(
      (chunk) => chunk.section.includes("项目归属") && chunk.text.includes("项目 Beta"),
    );
    expect(alpha?.company).toBe("公司 A");
    expect(alpha?.sourceType).toBe("structured");
    expect(alpha?.text).toContain("所属公司/机构：公司 A");
    expect(alpha?.text).toMatch(/职责：/);
    expect(beta?.company).toBe("公司 B");
    expect(beta?.text).toContain("项目 Beta");
    expect(chunks.every((chunk) => chunk.documentId === "job-profile")).toBe(true);
  });

  it("surfaces resume vs profile affiliation conflicts for human confirmation", () => {
    const profile = normalizeJobProfile(example);
    const chunks: DocumentChunkRecord[] = [
      {
        evidence_id: "doc-x:chunk-001",
        document_id: "doc-x",
        filename: "resume.pdf",
        knowledge_space: "job",
        section: "工作经历",
        content: "参与 项目 Alpha 相关工作",
        chunk_index: 1,
        content_type: "resume",
        section_type: "experience",
        company: "公司 B",
        role: "产品实习生",
      },
    ];
    const hints = detectProfileResumeConflicts(profile, chunks);
    expect(hints.length).toBeGreaterThan(0);
    expect(hints[0]).toContain("结构化档案与原始资料存在差异，请人工确认");
    expect(hints[0]).toContain("项目 Alpha");
  });

  it("does not put real private profile path contents into the tracked fixture", () => {
    const fixturePath = path.join(process.cwd(), "fixtures", "job-profile.example.json");
    const raw = fs.readFileSync(fixturePath, "utf8");
    expect(raw).toContain("example@example.com");
    expect(raw).toContain("张三");
    expect(raw).not.toMatch(/1[3-9]\d{9}/);
    expect(raw.toLowerCase()).not.toContain("zhangjiabao");
  });

  it("keeps .data/profile gitignored", () => {
    const gitignore = fs.readFileSync(path.join(process.cwd(), ".gitignore"), "utf8");
    expect(gitignore).toMatch(/\.data\//);
    expect(isJobProfileEmpty(EMPTY_JOB_PROFILE)).toBe(true);
  });

  it("round-trips affiliations through normalize without inventing phone", () => {
    const profile = normalizeJobProfile(example);
    const again = normalizeJobProfile(JSON.parse(JSON.stringify(profile)));
    expect(again.phone).toBe("");
    expect(
      profileProjectAffiliations(again).find((row) => row.project_name === "项目 Alpha")
        ?.company,
    ).toBe("公司 A");
    expect(
      profileProjectAffiliations(again).find((row) => row.project_name === "项目 Beta")
        ?.company,
    ).toBe("公司 B");
  });

  it("requires explicit confirm when replacing a non-empty profile", () => {
    const current = normalizeJobProfile(example);
    const incoming = normalizeJobProfile({ ...example, name: "李四" });
    const requiresConfirm = !isJobProfileEmpty(current);
    expect(requiresConfirm).toBe(true);
    expect(diffJobProfiles(current, incoming).some((diff) => diff.path === "name")).toBe(
      true,
    );
  });

  it("maps ChatGPT legacy contact/experience/academic into the new schema", () => {
    const imported = parseJobProfileImport(legacyChatgpt);
    const profile = imported.profile;

    expect(profile.email).toBe("legacy-import@example.com");
    expect(profile.phone).toBe("13800000000");
    expect(profile.location).toBe("示例市");
    expect(profile.target_roles).toContain("AI 产品经理");
    expect(profile.internships).toHaveLength(4);

    const byCompany = Object.fromEntries(
      profile.internships.map((row) => [row.company, row] as const),
    );

    expect(byCompany["天翼物联科技有限公司"]?.role).toBe("产品经理实习生");
    expect(byCompany["天翼物联科技有限公司"]?.projects.map((p) => p.project_name)).toEqual([
      "I-Park 智能园区",
    ]);
    expect(byCompany["天翼物联科技有限公司"]?.projects[0]?.company).toBe(
      "天翼物联科技有限公司",
    );
    expect(byCompany["天翼物联科技有限公司"]?.projects[0]?.role).toBe("产品经理实习生");
    expect(byCompany["天翼物联科技有限公司"]?.projects[0]?.responsibilities).toBe("");
    expect(byCompany["天翼物联科技有限公司"]?.projects[0]?.results).toBe("");

    expect(byCompany["北京赛曙科技有限公司"]?.role).toBe("产品测试实习生");
    expect(byCompany["北京赛曙科技有限公司"]?.projects.map((p) => p.project_name)).toEqual([
      "工业机械臂",
    ]);

    expect(byCompany["南方科技大学"]?.role).toBe("研究助理实习生");
    expect(byCompany["南方科技大学"]?.projects.map((p) => p.project_name)).toEqual([
      "南方电网电力电缆安全预警系统研究与应用",
      "AI 边缘计算盒子项目支持",
    ]);

    expect(byCompany["亿次网联（杭州）科技有限公司"]?.role).toBe("产品实习生");
    expect(
      byCompany["亿次网联（杭州）科技有限公司"]?.projects.map((p) => p.project_name),
    ).toEqual(["国信智会", "国信密盒", "办公 Agent", "ASR 效果评测"]);

    const affiliations = profileProjectAffiliations(profile);
    expect(affiliations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          company: "天翼物联科技有限公司",
          project_name: "I-Park 智能园区",
        }),
        expect.objectContaining({
          company: "亿次网联（杭州）科技有限公司",
          project_name: "国信智会",
        }),
        expect.objectContaining({
          company: "亿次网联（杭州）科技有限公司",
          project_name: "国信密盒",
        }),
      ]),
    );

    expect(profile.skills.product).toContain("PRD 撰写");
    expect(profile.skills.data).toContain("SQL");
    expect(profile.skills.ai).toContain("RAG 概念");
    expect(profile.academic.papers.some((item) => item.includes("示例论文甲"))).toBe(true);
    expect(profile.academic.patents.some((item) => item.includes("示例专利甲"))).toBe(true);
    expect(profile.academic.patents.some((item) => item.includes("CN0000000000.0"))).toBe(true);
  });

  it("does not invent contact fields when legacy contact is missing", () => {
    const profile = normalizeJobProfile({
      name: "示例候选人",
      experience: [
        {
          company: "天翼物联科技有限公司",
          role: "产品经理实习生",
          projects: ["I-Park 智能园区"],
        },
      ],
    });
    expect(profile.email).toBe("");
    expect(profile.phone).toBe("");
    expect(profile.location).toBe("");
    expect(profile.internships).toHaveLength(1);
  });
});
