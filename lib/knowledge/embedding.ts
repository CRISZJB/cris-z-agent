import { getRetrievalConfig } from "./retrieval-config";

type FeatureExtractionPipeline = (
  texts: string | string[],
  options?: { pooling?: "mean" | "cls"; normalize?: boolean },
) => Promise<{ tolist: () => number[] | number[][] } | number[] | number[][] | Float32Array>;

let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;
let loadedModelId: string | null = null;

export function resetEmbeddingPipeline() {
  pipelinePromise = null;
  loadedModelId = null;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const pipe = await getEmbeddingPipeline();
  const output = await pipe(texts, { pooling: "mean", normalize: true });
  return toMatrix(output, texts.length);
}

export async function embedQuery(query: string): Promise<number[]> {
  const [vector] = await embedTexts([query]);
  if (!vector) {
    throw new Error("Query embedding returned empty result.");
  }
  return vector;
}

async function getEmbeddingPipeline(): Promise<FeatureExtractionPipeline> {
  const model = getRetrievalConfig().embeddingModel;
  if (pipelinePromise && loadedModelId === model) {
    return pipelinePromise;
  }

  loadedModelId = model;
  pipelinePromise = (async () => {
    const { pipeline, env } = await import("@huggingface/transformers");
    // Keep model files under project cache for Windows predictability.
    env.cacheDir = `${process.cwd()}/.data/models`;
    env.allowLocalModels = true;
    // Optional mirror for regions where huggingface.co times out, e.g. HF_ENDPOINT=https://hf-mirror.com
    const remoteHost = process.env.HF_ENDPOINT?.trim() || process.env.EMBEDDING_REMOTE_HOST?.trim();
    if (remoteHost) {
      env.remoteHost = remoteHost.endsWith("/") ? remoteHost : `${remoteHost}/`;
    }
    return (await pipeline("feature-extraction", model)) as FeatureExtractionPipeline;
  })();

  try {
    return await pipelinePromise;
  } catch (error) {
    pipelinePromise = null;
    loadedModelId = null;
    throw error;
  }
}

function toMatrix(output: unknown, expectedRows: number): number[][] {
  if (output && typeof output === "object" && "tolist" in output) {
    const listed = (output as { tolist: () => number[] | number[][] }).tolist();
    return normalizeMatrix(listed, expectedRows);
  }
  if (Array.isArray(output)) {
    return normalizeMatrix(output as number[] | number[][], expectedRows);
  }
  if (output instanceof Float32Array) {
    return normalizeMatrix(Array.from(output), expectedRows);
  }
  throw new Error("Unexpected embedding output shape.");
}

function normalizeMatrix(listed: number[] | number[][], expectedRows: number): number[][] {
  if (listed.length === 0) {
    return [];
  }
  if (typeof listed[0] === "number") {
    if (expectedRows !== 1) {
      throw new Error("Unexpected flat embedding for batch input.");
    }
    return [listed as number[]];
  }
  const matrix = listed as number[][];
  if (matrix.length !== expectedRows) {
    throw new Error(`Embedding batch size mismatch: got ${matrix.length}, expected ${expectedRows}.`);
  }
  return matrix.map((row) => row.map((value) => Number(value)));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
