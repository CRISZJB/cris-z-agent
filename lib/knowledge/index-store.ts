import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadKnowledgeBase } from "./loader";
import { getRetrievalConfig } from "./retrieval-config";
import type { ContentStatus, KnowledgeChunk } from "./types";

export type IndexRecord = {
  evidence_id: string;
  title: string;
  content: string;
  source: string;
  project_id?: string;
  section: string;
  url?: string;
  embedding: number[];
  status: ContentStatus;
  is_demo: boolean;
  knowledge_space?: string;
  document_id?: string;
  source_name?: string;
  source_type?: import("./visibility").KnowledgeSourceType;
};

export type KnowledgeIndex = {
  version: 1;
  model: string;
  audience: string;
  contentHash: string;
  createdAt: string;
  dimensions: number;
  records: IndexRecord[];
};

export type EmbedFn = (texts: string[], options?: { isQuery?: boolean }) => Promise<number[][]>;

export type IndexBuildOptions = {
  force?: boolean;
  embed?: EmbedFn;
  indexPath?: string;
  model?: string;
};

let memoryIndex: KnowledgeIndex | null = null;
let memoryIndexPath: string | null = null;

export function resetIndexCache() {
  memoryIndex = null;
  memoryIndexPath = null;
}

export function computeContentHash(input: {
  model: string;
  audience: string;
  chunks: Array<Pick<KnowledgeChunk, "evidenceId" | "title" | "section" | "text" | "path">>;
}): string {
  const payload = {
    model: input.model,
    audience: input.audience,
    chunks: input.chunks.map((chunk) => ({
      evidenceId: chunk.evidenceId,
      title: chunk.title,
      section: chunk.section,
      text: chunk.text,
      path: chunk.path,
    })),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function getDefaultIndexPath() {
  return path.resolve(process.cwd(), getRetrievalConfig().indexPath);
}

export function readIndexFile(indexPath = getDefaultIndexPath()): KnowledgeIndex | null {
  if (!fs.existsSync(indexPath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(indexPath, "utf8");
    const parsed = JSON.parse(raw) as KnowledgeIndex;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.records)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeIndexFile(index: KnowledgeIndex, indexPath = getDefaultIndexPath()) {
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, JSON.stringify(index), "utf8");
  memoryIndex = index;
  memoryIndexPath = indexPath;
}

export function currentCorpusFingerprint(model = getRetrievalConfig().embeddingModel) {
  const { chunks, audience } = loadKnowledgeBase();
  return {
    chunks,
    audience,
    model,
    contentHash: computeContentHash({ model, audience, chunks }),
  };
}

export async function buildKnowledgeIndex(options: IndexBuildOptions = {}): Promise<{
  index: KnowledgeIndex;
  rebuilt: boolean;
  reason: "forced" | "missing" | "stale" | "cached";
}> {
  const config = getRetrievalConfig();
  const indexPath = options.indexPath
    ? path.isAbsolute(options.indexPath)
      ? options.indexPath
      : path.resolve(process.cwd(), options.indexPath)
    : getDefaultIndexPath();
  const model = options.model ?? config.embeddingModel;
  const { chunks, audience, contentHash } = currentCorpusFingerprint(model);

  const existing =
    memoryIndex && memoryIndexPath === indexPath ? memoryIndex : readIndexFile(indexPath);

  if (
    !options.force &&
    existing &&
    existing.model === model &&
    existing.contentHash === contentHash &&
    existing.records.length === chunks.length
  ) {
    memoryIndex = existing;
    memoryIndexPath = indexPath;
    return { index: existing, rebuilt: false, reason: "cached" };
  }

  const reason: "forced" | "missing" | "stale" = options.force
    ? "forced"
    : existing
      ? "stale"
      : "missing";

  const embed = options.embed ?? (await loadDefaultEmbedder());
  const texts = chunks.map((chunk) => passageText(chunk));
  const embeddings = texts.length > 0 ? await embed(texts, { isQuery: false }) : [];

  if (embeddings.length !== chunks.length) {
    throw new Error(`Embedding count mismatch: got ${embeddings.length}, expected ${chunks.length}.`);
  }

  const records: IndexRecord[] = chunks.map((chunk, index) => ({
    evidence_id: chunk.evidenceId,
    title: chunk.title,
    content: chunk.text,
    source: chunk.path,
    project_id: chunk.projectId,
    section: chunk.section,
    url: chunk.slug ? `/projects/${chunk.slug}` : undefined,
    embedding: embeddings[index] ?? [],
    status: chunk.status,
    is_demo: chunk.isDemo,
    knowledge_space: chunk.knowledgeSpace,
    document_id: chunk.documentId,
    source_name: chunk.sourceName,
    source_type: chunk.sourceType,
  }));

  const index: KnowledgeIndex = {
    version: 1,
    model,
    audience,
    contentHash,
    createdAt: new Date().toISOString(),
    dimensions: records[0]?.embedding.length ?? 0,
    records,
  };

  writeIndexFile(index, indexPath);
  return { index, rebuilt: true, reason };
}

export async function ensureKnowledgeIndex(options: IndexBuildOptions = {}) {
  return buildKnowledgeIndex({ ...options, force: options.force ?? false });
}

function passageText(chunk: KnowledgeChunk) {
  return `${chunk.title}\n${chunk.section}\n${chunk.text}`;
}

async function loadDefaultEmbedder(): Promise<EmbedFn> {
  const { embedTexts } = await import("./embedding");
  return embedTexts;
}
