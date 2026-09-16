import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bm25Search } from "../bm25";
import { cosineSimilarity } from "../embedding";
import { hybridSearch } from "../hybrid";
import {
  buildKnowledgeIndex,
  computeContentHash,
  resetIndexCache,
  type IndexRecord,
  type KnowledgeIndex,
} from "../index-store";
import { loadKnowledgeBase } from "../loader";
import { getRetrievalConfig } from "../retrieval-config";
import { search, searchAsync } from "../search";
import { vectorSearch } from "../vector";

function fakeEmbed(texts: string[]): Promise<number[][]> {
  return Promise.resolve(
    texts.map((text) => {
      const lower = text.toLowerCase();
      // Deterministic 4-d vectors for unit tests.
      return [
        lower.includes("tradeoff") || lower.includes("取舍") || lower.includes("向量") ? 1 : 0,
        lower.includes("retro") || lower.includes("复盘") || lower.includes("重新") ? 1 : 0,
        lower.includes("role") || lower.includes("职责") || lower.includes("负责") ? 1 : 0,
        lower.includes("user-problem") || lower.includes("用户问题") ? 1 : 0,
      ];
    }),
  );
}

function makeIndex(records: Array<Partial<IndexRecord> & Pick<IndexRecord, "evidence_id" | "embedding">>): KnowledgeIndex {
  return {
    version: 1,
    model: "fake-model",
    audience: "public",
    contentHash: "hash",
    createdAt: new Date().toISOString(),
    dimensions: 4,
    records: records.map((record) => ({
      evidence_id: record.evidence_id,
      title: record.title ?? "title",
      content: record.content ?? "content",
      source: record.source ?? "content/projects/project-1.md",
      project_id: record.project_id ?? "project-1",
      section: record.section ?? "section",
      url: record.url ?? "/projects/project-1",
      embedding: record.embedding,
      status: record.status ?? "published",
      is_demo: record.is_demo ?? false,
    })),
  };
}

describe("retrieval layer", () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    resetIndexCache();
    vi.stubEnv("CONTENT_AUDIENCE", "public");
    vi.stubEnv("RETRIEVAL_MODE", "bm25");
    vi.stubEnv("EMBEDDING_MODEL", "fake-model");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetIndexCache();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps BM25 working independently", () => {
    const hits = bm25Search("产品取舍 向量数据库", 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((hit) => hit.evidenceId === "project-1:tradeoffs")).toBe(true);
  });

  it("vector search returns valid evidence ids", async () => {
    const index = makeIndex([
      { evidence_id: "project-1:tradeoffs", embedding: [1, 0, 0, 0], section: "产品取舍", content: "放弃向量库" },
      { evidence_id: "project-1:retro", embedding: [0, 1, 0, 0], section: "项目复盘", content: "如果重新做" },
    ]);
    const hits = await vectorSearch("为什么没有使用向量数据库", {
      limit: 2,
      index,
      embedQueryFn: async () => [1, 0, 0, 0],
    });
    expect(hits[0]?.evidenceId).toBe("project-1:tradeoffs");
    expect(hits[0]?.path).toContain("content/");
    expect(hits[0]?.vectorScore).toBeGreaterThan(0);
  });

  it("hybrid dedupes by evidence_id", async () => {
    const bm25Hits = bm25Search("产品取舍", 8);
    const vectorHits = await vectorSearch("产品取舍", {
      limit: 8,
      index: makeIndex(
        bm25Hits.slice(0, 3).map((hit, i) => ({
          evidence_id: hit.evidenceId,
          embedding: [1 - i * 0.1, 0, 0, 0],
          section: hit.section,
          content: hit.snippet,
          source: hit.path,
        })),
      ),
      embedQueryFn: async () => [1, 0, 0, 0],
    });

    const hybrid = await hybridSearch("产品取舍", {
      limit: 5,
      bm25Fn: () => bm25Hits,
      vectorFn: async () => vectorHits,
    });

    const ids = hybrid.map((hit) => hit.evidenceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("preserves existing evidence ids when indexing", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-index-"));
    tempDirs.push(dir);
    const indexPath = path.join(dir, "index.json");
    const { index } = await buildKnowledgeIndex({
      force: true,
      indexPath,
      embed: fakeEmbed,
      model: "fake-model",
    });
    expect(index.records.some((record) => record.evidence_id === "project-1:tradeoffs")).toBe(true);
    expect(index.records.some((record) => record.evidence_id === "project-1:retro")).toBe(true);
    expect(index.records.some((record) => record.evidence_id === "profile:intro")).toBe(true);
    expect(index.records.every((record) => record.status === "published")).toBe(true);
    expect(index.records.some((record) => record.is_demo)).toBe(false);
  });

  it("public audience does not index demo or draft", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-index-"));
    tempDirs.push(dir);
    const { index } = await buildKnowledgeIndex({
      force: true,
      indexPath: path.join(dir, "index.json"),
      embed: fakeEmbed,
      model: "fake-model",
    });
    expect(index.records.some((record) => record.evidence_id.startsWith("demo-"))).toBe(false);
    expect(index.records.every((record) => record.status === "published")).toBe(true);
  });

  it("content hash changes when chunk text changes", () => {
    const { chunks, audience } = loadKnowledgeBase();
    const base = computeContentHash({ model: "fake-model", audience, chunks });
    const mutated = computeContentHash({
      model: "fake-model",
      audience,
      chunks: chunks.map((chunk, index) =>
        index === 0 ? { ...chunk, text: `${chunk.text}\nchanged` } : chunk,
      ),
    });
    expect(base).not.toBe(mutated);
  });

  it("does not re-embed when content and model are unchanged", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-index-"));
    tempDirs.push(dir);
    const indexPath = path.join(dir, "index.json");
    const embed = vi.fn(fakeEmbed);

    const first = await buildKnowledgeIndex({ force: true, indexPath, embed, model: "fake-model" });
    expect(first.rebuilt).toBe(true);
    expect(embed).toHaveBeenCalled();

    embed.mockClear();
    resetIndexCache();
    const second = await buildKnowledgeIndex({ indexPath, embed, model: "fake-model" });
    expect(second.rebuilt).toBe(false);
    expect(second.reason).toBe("cached");
    expect(embed).not.toHaveBeenCalled();
  });

  it("falls back to BM25 when vector retrieval fails", async () => {
    const hits = await searchAsync("产品取舍", 3, {
      mode: "hybrid",
      hybridSearchFn: async () => {
        throw new Error("embedding model load failed");
      },
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => hit.evidenceId.includes(":"))).toBe(true);
  });

  it("switches retrieval mode via config", () => {
    vi.stubEnv("RETRIEVAL_MODE", "bm25");
    expect(getRetrievalConfig().mode).toBe("bm25");
    vi.stubEnv("RETRIEVAL_MODE", "vector");
    expect(getRetrievalConfig().mode).toBe("vector");
    vi.stubEnv("RETRIEVAL_MODE", "hybrid");
    expect(getRetrievalConfig().mode).toBe("hybrid");
    vi.stubEnv("RETRIEVAL_MODE", "nope");
    expect(getRetrievalConfig().mode).toBe("bm25");
  });

  it("sync search still returns BM25 hits for existing callers", () => {
    vi.stubEnv("RETRIEVAL_MODE", "bm25");
    const hits = search("人工智能 产品 项目 经验");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((hit) => hit.projectId === "project-1")).toBe(true);
  });

  it("cosine similarity is 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0);
  });
});
