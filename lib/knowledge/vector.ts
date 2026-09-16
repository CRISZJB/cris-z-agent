import { cosineSimilarity, embedQuery } from "./embedding";
import { ensureKnowledgeIndex, type IndexRecord, type KnowledgeIndex } from "./index-store";
import { snippetFrom } from "./parse";
import type { SearchHit } from "./types";

export type VectorSearchOptions = {
  limit?: number;
  index?: KnowledgeIndex;
  embedQueryFn?: (query: string) => Promise<number[]>;
  ensureIndex?: () => Promise<KnowledgeIndex>;
};

export async function vectorSearch(query: string, limitOrOptions: number | VectorSearchOptions = 5): Promise<SearchHit[]> {
  const options: VectorSearchOptions =
    typeof limitOrOptions === "number" ? { limit: limitOrOptions } : limitOrOptions;
  const limit = options.limit ?? 5;
  const trimmed = query.trim();
  if (!trimmed || limit <= 0) {
    return [];
  }

  const index =
    options.index ??
    (options.ensureIndex
      ? await options.ensureIndex()
      : (await ensureKnowledgeIndex()).index);

  if (!index.records.length) {
    return [];
  }

  const embed = options.embedQueryFn ?? embedQuery;
  const queryEmbedding = await embed(trimmed);

  const scored = index.records
    .map((record) => ({
      record,
      score: cosineSimilarity(queryEmbedding, record.embedding),
    }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ record, score }) => recordToHit(record, score, trimmed));
}

export function recordToHit(record: IndexRecord, score: number, query: string): SearchHit {
  return {
    evidenceId: record.evidence_id,
    title: record.title,
    snippet: snippetFrom(record.content, query),
    path: record.source,
    projectId: record.project_id,
    section: record.section,
    score: Number(score.toFixed(4)),
    href: record.url,
    status: record.status,
    isDemo: record.is_demo,
    vectorScore: Number(score.toFixed(4)),
    knowledgeSpace: (record.knowledge_space as SearchHit["knowledgeSpace"]) || "job",
    documentId: record.document_id,
    sourceName: record.source_name ?? record.title,
    sourceType: record.source_type ?? (record.document_id?.startsWith("doc-") ? "uploaded" : "legacy"),
  };
}
