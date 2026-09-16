import { bm25Search } from "./bm25";
import { getRetrievalConfig } from "./retrieval-config";
import type { SearchHit } from "./types";
import { vectorSearch, type VectorSearchOptions } from "./vector";

export type HybridSearchOptions = VectorSearchOptions & {
  bm25Weight?: number;
  vectorWeight?: number;
  rrfK?: number;
  fusion?: "weighted" | "rrf";
  bm25Fn?: typeof bm25Search;
  vectorFn?: typeof vectorSearch;
};

export async function hybridSearch(
  query: string,
  limitOrOptions: number | HybridSearchOptions = 5,
): Promise<SearchHit[]> {
  const options: HybridSearchOptions =
    typeof limitOrOptions === "number" ? { limit: limitOrOptions } : limitOrOptions;
  const limit = options.limit ?? 5;
  const config = getRetrievalConfig();
  const fusion = options.fusion ?? config.hybridFusion;
  const bm25Fn = options.bm25Fn ?? bm25Search;
  const vectorFn = options.vectorFn ?? vectorSearch;

  const candidateLimit = Math.max(limit * 4, 12);
  const [bm25Hits, vectorHits] = await Promise.all([
    Promise.resolve(bm25Fn(query, candidateLimit)),
    vectorFn(query, { ...options, limit: candidateLimit }),
  ]);

  if (fusion === "rrf") {
    return reciprocalRankFusion(bm25Hits, vectorHits, limit, options.rrfK ?? config.rrfK);
  }

  return weightedFusion(
    bm25Hits,
    vectorHits,
    limit,
    options.bm25Weight ?? config.hybridBm25Weight,
    options.vectorWeight ?? config.hybridVectorWeight,
  );
}

function weightedFusion(
  bm25Hits: SearchHit[],
  vectorHits: SearchHit[],
  limit: number,
  bm25Weight: number,
  vectorWeight: number,
): SearchHit[] {
  const bm25Norm = minMaxNormalize(bm25Hits);
  const vectorNorm = minMaxNormalize(vectorHits);
  const ids = new Set([...bm25Norm.keys(), ...vectorNorm.keys()]);
  const byId = new Map<string, SearchHit>();
  for (const hit of [...bm25Hits, ...vectorHits]) {
    if (!byId.has(hit.evidenceId)) {
      byId.set(hit.evidenceId, hit);
    }
  }

  const weightSum = bm25Weight + vectorWeight || 1;
  const ranked = [...ids]
    .map((id) => {
      const base = byId.get(id);
      if (!base) {
        return null;
      }
      const bm25 = bm25Norm.get(id) ?? 0;
      const vector = vectorNorm.get(id) ?? 0;
      const score = (bm25Weight * bm25 + vectorWeight * vector) / weightSum;
      const hit: SearchHit = {
        ...base,
        score: Number(score.toFixed(4)),
        bm25Score: bm25Hits.find((item) => item.evidenceId === id)?.score,
        vectorScore: vectorHits.find((item) => item.evidenceId === id)?.score,
      };
      return hit;
    })
    .filter((item): item is SearchHit => item !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return ranked;
}

function reciprocalRankFusion(
  bm25Hits: SearchHit[],
  vectorHits: SearchHit[],
  limit: number,
  k: number,
): SearchHit[] {
  const scores = new Map<string, number>();
  const byId = new Map<string, SearchHit>();

  const add = (hits: SearchHit[]) => {
    hits.forEach((hit, index) => {
      byId.set(hit.evidenceId, hit);
      const contribution = 1 / (k + index + 1);
      scores.set(hit.evidenceId, (scores.get(hit.evidenceId) ?? 0) + contribution);
    });
  };

  add(bm25Hits);
  add(vectorHits);

  return [...scores.entries()]
    .map(([id, score]) => {
      const base = byId.get(id)!;
      return {
        ...base,
        score: Number(score.toFixed(4)),
        bm25Score: bm25Hits.find((hit) => hit.evidenceId === id)?.score,
        vectorScore: vectorHits.find((hit) => hit.evidenceId === id)?.score,
      } satisfies SearchHit;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function minMaxNormalize(hits: SearchHit[]): Map<string, number> {
  const map = new Map<string, number>();
  if (hits.length === 0) {
    return map;
  }
  const scores = hits.map((hit) => hit.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = max - min;
  for (const hit of hits) {
    map.set(hit.evidenceId, span === 0 ? 1 : (hit.score - min) / span);
  }
  return map;
}
