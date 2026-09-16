import { bm25Search } from "./bm25";
import { hybridSearch } from "./hybrid";
import { getRetrievalConfig, type RetrievalMode } from "./retrieval-config";
import type { KnowledgeScope } from "./spaces";
import type { SearchHit } from "./types";
import { vectorSearch } from "./vector";

export type SearchOptions = {
  mode?: RetrievalMode;
  limit?: number;
  scope?: KnowledgeScope;
  vectorSearchFn?: typeof vectorSearch;
  hybridSearchFn?: typeof hybridSearch;
};

export function search(query: string, limit = 5, scope: KnowledgeScope = "all"): SearchHit[] {
  const mode = getRetrievalConfig().mode;
  if (mode !== "bm25" && process.env.NODE_ENV !== "production") {
    console.warn(
      `Vector retrieval unavailable in sync search() for mode=${mode} → fallback to BM25`,
    );
  }
  return bm25Search(query, limit, scope);
}

export async function searchAsync(
  query: string,
  limit = 5,
  options?: SearchOptions,
): Promise<SearchHit[]> {
  const mode = options?.mode ?? getRetrievalConfig().mode;
  const topK = options?.limit ?? limit;
  const scope = options?.scope ?? "all";
  const runVector = options?.vectorSearchFn ?? vectorSearch;
  const runHybrid = options?.hybridSearchFn ?? hybridSearch;

  if (mode === "bm25") {
    return bm25Search(query, topK, scope);
  }

  try {
    if (mode === "vector") {
      const hits = await runVector(query, topK);
      return filterByScope(hits, scope);
    }
    const hits = await runHybrid(query, topK);
    return filterByScope(hits, scope);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Vector retrieval unavailable → fallback to BM25 (${message})`);
    }
    return bm25Search(query, topK, scope);
  }
}

function filterByScope(hits: SearchHit[], scope: KnowledgeScope) {
  if (scope === "all") {
    return hits;
  }
  return hits.filter((hit) => hit.knowledgeSpace === scope);
}

export { bm25Search } from "./bm25";
export { vectorSearch } from "./vector";
export { hybridSearch } from "./hybrid";
