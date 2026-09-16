import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeTool } from "../tools";

describe("agent tools", () => {
  beforeEach(() => {
    vi.stubEnv("RETRIEVAL_MODE", "bm25");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("search_knowledge returns titled snippets with sources", async () => {
    const { result } = await executeTool(
      "search_knowledge",
      JSON.stringify({ query: "人工智能作品集智能体" }),
    );
    expect(result.ok).toBe(true);
    const data = result.data as {
      results: Array<{ title: string; path: string; section: string; evidence_id: string }>;
    };
    expect(data.results.length).toBeGreaterThan(0);
    expect(data.results[0]?.title).toBeTruthy();
    expect(data.results[0]?.evidence_id).toMatch(/:/);
    expect(data.results[0]?.path).toContain("content/");
    expect(result.evidence[0]?.id).toMatch(/:/);
  });

  it("get_project loads a demo project by id", async () => {
    const { result } = await executeTool(
      "get_project",
      JSON.stringify({ project_id: "demo-portfolio-agent" }),
    );
    expect(result.ok).toBe(true);
    const data = result.data as { found: boolean; project: { title: string; is_demo: boolean } };
    expect(data.found).toBe(true);
    expect(data.project.is_demo).toBe(true);
    expect(data.project.title).toContain("作品集智能体");
  });

  it("get_project explains when the id does not exist", async () => {
    const { result } = await executeTool(
      "get_project",
      JSON.stringify({ project_id: "google-search-ranking" }),
    );
    expect(result.ok).toBe(true);
    const data = result.data as {
      found: boolean;
      message: string;
      available_projects: Array<{ id: string }>;
    };
    expect(data.found).toBe(false);
    expect(data.message).toMatch(/不存在于当前可访问知识库/);
    expect(data.available_projects.some((item) => item.id === "project-1")).toBe(true);
  });

  it("get_profile and list_projects work without arguments", async () => {
    const profile = await executeTool("get_profile", "{}");
    const projects = await executeTool("list_projects", "{}");
    expect(profile.result.ok).toBe(true);
    expect(projects.result.ok).toBe(true);
    const listed = projects.result.data as { projects: Array<{ id: string }> };
    expect(listed.projects.some((item) => item.id === "demo-portfolio-agent")).toBe(true);
  });

  it("rejects invalid search arguments without throwing", async () => {
    const { result, trace } = await executeTool("search_knowledge", JSON.stringify({ query: "" }));
    expect(result.ok).toBe(false);
    expect(trace.error).toMatch(/query/);
  });

  it("search_knowledge keeps evidence_id while capping snippet length for the model", async () => {
    const { result } = await executeTool(
      "search_knowledge",
      JSON.stringify({ query: "人工智能作品集智能体", limit: 5 }),
    );
    expect(result.ok).toBe(true);
    const data = result.data as {
      results: Array<{ evidence_id: string; snippet: string }>;
    };
    expect(data.results.length).toBeGreaterThan(0);
    expect(data.results.length).toBeLessThanOrEqual(5);
    for (const row of data.results) {
      expect(row.evidence_id).toMatch(/:/);
      expect(row.snippet.length).toBeLessThanOrEqual(820);
    }
    expect(result.evidence.every((item) => item.id.includes(":"))).toBe(true);
  });

  it("read_document respects max_chars and does not dump unbounded content", async () => {
    const listed = await executeTool("list_documents", "{}");
    const docs = (listed.result.data as { documents: Array<{ document_id: string }> }).documents;
    if (docs.length === 0) {
      return;
    }
    const { result } = await executeTool(
      "read_document",
      JSON.stringify({ document_id: docs[0]?.document_id, max_chars: 800 }),
    );
    expect(result.ok).toBe(true);
    const data = result.data as {
      found: boolean;
      returned_chars: number;
      max_chars: number;
      chunks: Array<{ evidence_id: string; content: string }>;
    };
    expect(data.found).toBe(true);
    expect(data.max_chars).toBe(800);
    expect(data.returned_chars).toBeLessThanOrEqual(800);
    for (const chunk of data.chunks) {
      expect(chunk.evidence_id).toBeTruthy();
    }
    expect(result.evidence.every((item) => Boolean(item.id))).toBe(true);
  });

  it("get_profile and list_projects are blocked when legacy is disabled", async () => {
    const { runWithIncludeLegacy } = await import("../../knowledge/visibility");
    await runWithIncludeLegacy(false, async () => {
      const profile = await executeTool("get_profile", "{}");
      const projects = await executeTool("list_projects", "{}");
      expect(profile.result.ok).toBe(true);
      expect((profile.result.data as { available?: boolean }).available).toBe(false);
      expect((projects.result.data as { projects: unknown[] }).projects).toEqual([]);
    });
  });
});
