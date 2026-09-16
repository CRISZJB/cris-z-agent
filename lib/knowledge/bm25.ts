import { loadKnowledgeBase } from "./loader";
import { snippetFrom } from "./parse";
import { tokenize } from "./tokenize";
import type { KnowledgeChunk, SearchHit } from "./types";
import type { KnowledgeScope } from "./spaces";

const K1 = 1.2;
const B = 0.75;

export function bm25Search(
  query: string,
  limit = 5,
  chunksOrScope?: KnowledgeChunk[] | KnowledgeScope,
): SearchHit[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const corpus = Array.isArray(chunksOrScope)
    ? chunksOrScope
    : loadKnowledgeBase(chunksOrScope ?? "all").chunks;
  if (corpus.length === 0) {
    return [];
  }

  const queryTokens = tokenize(trimmed);
  if (queryTokens.length === 0) {
    return [];
  }

  const documentFrequencies = new Map<string, number>();
  const tokenizedChunks = corpus.map((chunk) => {
    const tokens = tokenize(`${chunk.title} ${chunk.section} ${chunk.text}`);
    const tf = new Map<string, number>();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) ?? 0) + 1);
    }
    for (const token of new Set(tokens)) {
      documentFrequencies.set(token, (documentFrequencies.get(token) ?? 0) + 1);
    }
    return { chunk, tokens, tf };
  });

  const avgLength =
    tokenizedChunks.reduce((sum, item) => sum + item.tokens.length, 0) / tokenizedChunks.length;
  const totalDocs = tokenizedChunks.length;

  const scored = tokenizedChunks
    .map(({ chunk, tokens, tf }) => {
      let score = 0;
      for (const token of queryTokens) {
        const frequency = tf.get(token);
        if (!frequency) {
          continue;
        }
        const df = documentFrequencies.get(token) ?? 0;
        const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
        const denominator = frequency + K1 * (1 - B + B * (tokens.length / avgLength));
        score += idf * ((frequency * (K1 + 1)) / denominator);
      }

      const haystack = `${chunk.title} ${chunk.section}`.toLowerCase();
      if (queryTokens.some((token) => token.length > 1 && haystack.includes(token))) {
        score *= 1.35;
      }

      return { chunk, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ chunk, score }) => toSearchHit(chunk, score, trimmed));
}

export function toSearchHit(chunk: KnowledgeChunk, score: number, query: string): SearchHit {
  return {
    evidenceId: chunk.evidenceId,
    title: chunk.title,
    snippet: snippetFrom(chunk.text, query),
    path: chunk.path,
    projectId: chunk.projectId,
    projectName: chunk.projectName,
    section: chunk.section,
    score: Number(score.toFixed(4)),
    href: chunk.slug ? `/projects/${chunk.slug}` : undefined,
    status: chunk.status,
    isDemo: chunk.isDemo,
    knowledgeSpace: chunk.knowledgeSpace,
    documentId: chunk.documentId,
    sourceName: chunk.sourceName ?? chunk.title,
    sourceType: chunk.sourceType,
    contentType: chunk.contentType,
    sectionType: chunk.sectionType,
    company: chunk.company,
    role: chunk.role,
    dateRange: chunk.dateRange,
    school: chunk.school,
    major: chunk.major,
    affiliationUnknown: chunk.affiliationUnknown,
  };
}
