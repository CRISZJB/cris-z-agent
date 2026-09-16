import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadProfile, loadProject, listProjects, search } from "../index";

describe("knowledge base", () => {
  beforeEach(() => {
    vi.stubEnv("RETRIEVAL_MODE", "bm25");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("loads published profile without placeholder biography", () => {
    vi.stubEnv("CONTENT_AUDIENCE", "public");
    const { profile, experience } = loadProfile();
    expect(profile.status).toBe("published");
    expect(profile.body).not.toContain("[需要用户补充");
    expect(profile.body).not.toContain("[演示内容]");
    expect(experience.body).toContain("没有收录任何公司任职记录");
    expect(profile.body).not.toMatch(/Google|字节跳动|阿里巴巴/);
  });

  it("lists demo projects for the author audience and published projects for the public", () => {
    vi.stubEnv("CONTENT_AUDIENCE", "author");
    const authorProjects = listProjects();
    expect(authorProjects.some((project) => project.id === "demo-portfolio-agent")).toBe(true);
    expect(authorProjects.some((project) => project.id === "project-1")).toBe(true);

    vi.stubEnv("CONTENT_AUDIENCE", "public");
    const publicProjects = listProjects();
    expect(publicProjects.every((project) => project.status === "published")).toBe(true);
    expect(publicProjects.some((project) => project.id === "project-1")).toBe(true);
    expect(publicProjects.some((project) => project.id === "demo-portfolio-agent")).toBe(false);
  });

  it("loads the published project by id with section-level evidence", () => {
    vi.stubEnv("CONTENT_AUDIENCE", "public");
    const project = loadProject("project-1");
    expect(project?.project?.title).toContain("人工智能作品集智能体");
    expect(project?.body).not.toContain("[演示内容]");
    expect(project?.sections.some((section) => section.evidenceId === "project-1:role")).toBe(true);
    expect(project?.sections.some((section) => section.evidenceId === "project-1:tradeoffs")).toBe(
      true,
    );
  });

  it("returns relevant chunks for an AI product query from published content", () => {
    vi.stubEnv("CONTENT_AUDIENCE", "public");
    const hits = search("人工智能 产品 项目 经验");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((hit) => hit.projectId === "project-1")).toBe(true);
  });

  it("does not invent a TikTok ranking project", () => {
    vi.stubEnv("CONTENT_AUDIENCE", "public");
    const hits = search("TikTok 推荐算法");
    const legacy = hits.filter((hit) => hit.sourceType === "legacy");
    const joined = legacy.map((hit) => `${hit.title} ${hit.snippet}`).join(" ");
    expect(joined).not.toMatch(/负责 TikTok 推荐算法/);
    expect(hits.every((hit) => hit.projectId !== "tiktok-ranking")).toBe(true);
  });
});
