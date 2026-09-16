import { describe, expect, it } from "vitest";
import { chunkResumeText } from "../resume-chunk";
import { bm25Search } from "../../knowledge/bm25";
import type { KnowledgeChunk } from "../../knowledge/types";

const FIXTURE = `
个人简历
教育背景
2020-09 ~ 2024-06\t大学甲\t计算机专业（本科）
实习经验
2024-07 ~ 2024-09\t公司 A\t产品实习生
• 负责项目 Alpha 的需求梳理与原型设计
• 做了 A 相关用户访谈与文档输出
2024-10 ~ 2024-12\t公司 B\t测试实习生
• 负责项目 Beta 的功能测试与缺陷跟踪
• 做了 B 相关测试报告
技能特长
• Python、SQL
`;

describe("resume-aware chunking", () => {
  it("keeps company A and company B experiences in separate evidence chunks", () => {
    const pieces = chunkResumeText(FIXTURE);
    const companyA = pieces.find((piece) => piece.meta?.company === "公司 A");
    const companyB = pieces.find((piece) => piece.meta?.company === "公司 B");
    expect(companyA).toBeTruthy();
    expect(companyB).toBeTruthy();
    expect(companyA?.content).toContain("项目 Alpha");
    expect(companyA?.content).toContain("做了 A");
    expect(companyA?.content).not.toContain("项目 Beta");
    expect(companyA?.content).not.toContain("公司 B");
    expect(companyB?.content).toContain("项目 Beta");
    expect(companyB?.content).toContain("做了 B");
    expect(companyB?.content).not.toContain("项目 Alpha");
    expect(companyB?.content).not.toContain("公司 A");
  });

  it("retrieves company A for Alpha without mixing company B into the same evidence", () => {
    const pieces = chunkResumeText(FIXTURE);
    const chunks: KnowledgeChunk[] = pieces.map((piece) => ({
      id: `doc-fixture:chunk-${String(piece.index).padStart(3, "0")}`,
      evidenceId: `doc-fixture:chunk-${String(piece.index).padStart(3, "0")}`,
      title: "fixture-resume.txt",
      text: piece.content,
      path: "fixture-resume.txt",
      kind: "upload",
      section: piece.section,
      status: "published",
      isDemo: false,
      knowledgeSpace: "job",
      documentId: "doc-fixture",
      sourceName: "fixture-resume.txt",
      sourceType: "uploaded",
      contentType: "resume",
      sectionType: piece.meta?.section_type,
      company: piece.meta?.company,
      role: piece.meta?.role,
      dateRange: piece.meta?.date_range,
    }));

    const hits = bm25Search("Alpha 是在哪家公司做的？", 3, chunks);
    expect(hits.length).toBeGreaterThan(0);
    const top = hits[0];
    expect(top?.company).toBe("公司 A");
    expect(top?.snippet).toContain("Alpha");
    expect(top?.snippet).not.toContain("公司 B");
    expect(top?.snippet).not.toContain("项目 Beta");
  });

  it("falls back gracefully when PDF-like consecutive headers make affiliation unclear", () => {
    const ambiguous = `
实习经验
2024-07 ~ 2024-09\t公司 A\t产品实习生
2024-10 ~ 2024-12\t公司 B\t测试实习生
• 负责项目 Alpha
• 负责项目 Beta
`;
    const pieces = chunkResumeText(ambiguous);
    const headerA = pieces.find((piece) => piece.meta?.company === "公司 A");
    const headerB = pieces.find((piece) => piece.meta?.company === "公司 B");
    const detail = pieces.find((piece) => piece.meta?.section_type === "experience_detail");
    expect(headerA?.content).toContain("公司 A");
    expect(headerA?.content).not.toContain("项目 Alpha");
    expect(headerB?.content).toContain("公司 B");
    expect(headerB?.content).not.toContain("项目 Beta");
    expect(detail?.content).toContain("项目 Alpha");
    expect(detail?.content).toContain("项目 Beta");
    expect(detail?.meta?.company).toBeUndefined();
    expect(detail?.meta?.affiliation_unknown).toBe(true);
  });
});
