import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listProjects, loadKnowledgeBase, loadProject, search } from "../index";
import {
  resolveChatIncludeLegacy,
  runWithIncludeLegacy,
  shouldIncludeLegacy,
} from "../visibility";

describe("legacy knowledge visibility", () => {
  beforeEach(() => {
    vi.stubEnv("RETRIEVAL_MODE", "bm25");
    vi.stubEnv("CONTENT_AUDIENCE", "public");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("excludes project-1 and portfolio content from default chat search", async () => {
    await runWithIncludeLegacy(false, async () => {
      expect(shouldIncludeLegacy()).toBe(false);
      expect(listProjects()).toEqual([]);
      expect(loadProject("project-1")).toBeNull();
      const hits = search("人工智能作品集智能体");
      expect(hits.every((hit) => hit.sourceType !== "legacy")).toBe(true);
      expect(hits.some((hit) => hit.projectId === "project-1")).toBe(false);
      expect(loadKnowledgeBase().includeLegacy).toBe(false);
    });
  });

  it("still retrieves legacy content when include_legacy is enabled", async () => {
    await runWithIncludeLegacy(true, async () => {
      expect(shouldIncludeLegacy()).toBe(true);
      expect(loadProject("project-1")?.project?.title).toContain("人工智能作品集智能体");
      const hits = search("人工智能 产品 项目");
      expect(hits.some((hit) => hit.projectId === "project-1")).toBe(true);
      expect(hits.some((hit) => hit.sourceType === "legacy")).toBe(true);
    });
  });

  it("marks uploaded chunks as uploaded and job profile as structured", async () => {
    await runWithIncludeLegacy(false, async () => {
      const { chunks } = loadKnowledgeBase();
      expect(chunks.every((chunk) => chunk.sourceType !== "legacy")).toBe(true);
      expect(
        chunks.filter((chunk) => chunk.sourceType === "structured").every((chunk) => {
          return chunk.sourceName === "求职档案" && chunk.documentId === "job-profile";
        }),
      ).toBe(true);
      expect(
        chunks.filter((chunk) => chunk.kind === "upload").every((chunk) => chunk.sourceType === "uploaded"),
      ).toBe(true);
    });
  });

  it("chat include_legacy is off by default and forced off in production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(resolveChatIncludeLegacy(undefined)).toBe(false);
    expect(resolveChatIncludeLegacy(false)).toBe(false);
    expect(resolveChatIncludeLegacy(true)).toBe(true);
    expect(resolveChatIncludeLegacy(false, true)).toBe(true);

    vi.stubEnv("NODE_ENV", "production");
    expect(resolveChatIncludeLegacy(true)).toBe(false);
    expect(resolveChatIncludeLegacy(true, true)).toBe(false);
  });
});
