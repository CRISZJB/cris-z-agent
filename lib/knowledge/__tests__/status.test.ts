import { afterEach, describe, expect, it, vi } from "vitest";
import { listProjects, loadKnowledgeBase, loadProfile, loadProject, search } from "../index";

describe("content status visibility", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps demo content available to the author audience", () => {
    vi.stubEnv("CONTENT_AUDIENCE", "author");
    expect(listProjects().some((project) => project.id === "demo-portfolio-agent")).toBe(true);
    expect(loadProfile().profile.status).toBe("published");
  });

  it("filters demo and draft out of public knowledge retrieval", () => {
    vi.stubEnv("CONTENT_AUDIENCE", "public");
    const projects = listProjects();
    expect(projects.every((project) => project.status === "published")).toBe(true);
    expect(loadProject("demo-portfolio-agent")).toBeNull();
    expect(loadProject("project-1")?.project?.status).toBe("published");
    expect(search("演示内容 占位项目").every((hit) => hit.status === "published")).toBe(true);
    expect(loadKnowledgeBase().documents.every((doc) => doc.status === "published")).toBe(true);
  });

  it("loads published profile in public audience", () => {
    vi.stubEnv("CONTENT_AUDIENCE", "public");
    expect(loadProfile().profile.status).toBe("published");
  });

  it("chat daily-use audience is public unless development demo is opted in", async () => {
    const {
      resolveChatContentAudience,
      resolveChatIncludeLegacy,
      runWithContentAudience,
      getContentAudience,
    } = await import("../visibility");

    vi.stubEnv("NODE_ENV", "development");
    expect(resolveChatContentAudience(false)).toBe("public");
    expect(resolveChatContentAudience(undefined)).toBe("public");
    expect(resolveChatContentAudience(true)).toBe("author");
    expect(resolveChatIncludeLegacy(false)).toBe(false);
    expect(resolveChatIncludeLegacy(true)).toBe(true);

    vi.stubEnv("NODE_ENV", "production");
    expect(resolveChatContentAudience(true)).toBe("public");
    expect(resolveChatIncludeLegacy(true)).toBe(false);

    vi.stubEnv("CONTENT_AUDIENCE", "author");
    await runWithContentAudience("public", async () => {
      expect(getContentAudience()).toBe("public");
      expect(listProjects().some((project) => project.id === "demo-portfolio-agent")).toBe(false);
      expect(listProjects().some((project) => project.id === "demo-placeholder-ai-feature")).toBe(
        false,
      );
    });
  });
});
