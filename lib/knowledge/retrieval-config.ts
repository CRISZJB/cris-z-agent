export type RetrievalMode = "bm25" | "vector" | "hybrid";

export const DEFAULT_RETRIEVAL_MODE: RetrievalMode = "bm25";
export const DEFAULT_EMBEDDING_MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
export const DEFAULT_HYBRID_BM25_WEIGHT = 0.45;
export const DEFAULT_HYBRID_VECTOR_WEIGHT = 0.55;
export const DEFAULT_RRF_K = 60;

export type RetrievalConfig = {
  mode: RetrievalMode;
  embeddingModel: string;
  hybridBm25Weight: number;
  hybridVectorWeight: number;
  rrfK: number;
  hybridFusion: "weighted" | "rrf";
  indexPath: string;
};

export function getRetrievalConfig(env: NodeJS.ProcessEnv = process.env): RetrievalConfig {
  const mode = parseMode(env.RETRIEVAL_MODE);
  const hybridBm25Weight = parseWeight(env.HYBRID_BM25_WEIGHT, DEFAULT_HYBRID_BM25_WEIGHT);
  const hybridVectorWeight = parseWeight(env.HYBRID_VECTOR_WEIGHT, DEFAULT_HYBRID_VECTOR_WEIGHT);
  const rrfK = parsePositiveInt(env.HYBRID_RRF_K, DEFAULT_RRF_K);
  const hybridFusion = env.HYBRID_FUSION?.trim().toLowerCase() === "weighted" ? "weighted" : "rrf";
  const embeddingModel = env.EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
  const indexPath = env.KNOWLEDGE_INDEX_PATH?.trim() || ".data/knowledge-index.json";

  return {
    mode,
    embeddingModel,
    hybridBm25Weight,
    hybridVectorWeight,
    rrfK,
    hybridFusion,
    indexPath,
  };
}

function parseMode(value: string | undefined): RetrievalMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "bm25" || normalized === "vector" || normalized === "hybrid") {
    return normalized;
  }
  return DEFAULT_RETRIEVAL_MODE;
}

function parseWeight(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}
