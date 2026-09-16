import { readFile } from "node:fs/promises";
import path from "node:path";
import { preparePublicEvalEnv } from "./eval-env";
import { bm25Search } from "../lib/knowledge/bm25";
import { ensureKnowledgeIndex, resetIndexCache } from "../lib/knowledge/index-store";
import { hybridSearch } from "../lib/knowledge/hybrid";
import { getRetrievalConfig } from "../lib/knowledge/retrieval-config";
import type { SearchHit } from "../lib/knowledge/types";
import { vectorSearch } from "../lib/knowledge/vector";
import { getContentAudience } from "../lib/knowledge/visibility";

preparePublicEvalEnv();

type RetrievalQuestion = {
  id: string;
  query: string;
  expected: string[];
  kind?: string;
};

type ModeName = "BM25" | "Vector" | "Hybrid";

async function main() {
  if (getContentAudience() !== "public") {
    throw new Error("retrieval eval 需要 CONTENT_AUDIENCE=public。");
  }

  resetIndexCache();
  const config = getRetrievalConfig();
  console.log(`audience=${getContentAudience()} model=${config.embeddingModel}`);
  console.log("Ensuring knowledge index…");
  const indexStarted = Date.now();
  const { index, rebuilt, reason } = await ensureKnowledgeIndex();
  console.log(
    `index ready: rebuilt=${rebuilt} reason=${reason} records=${index.records.length} elapsedMs=${Date.now() - indexStarted}`,
  );

  const file = path.join(process.cwd(), "evals", "retrieval.json");
  const payload = JSON.parse(await readFile(file, "utf8")) as { questions: RetrievalQuestion[] };
  const questions = payload.questions;

  const modes: ModeName[] = ["BM25", "Vector", "Hybrid"];
  const stats: Record<ModeName, { top1: number; top3: number; top5: number }> = {
    BM25: { top1: 0, top3: 0, top5: 0 },
    Vector: { top1: 0, top3: 0, top5: 0 },
    Hybrid: { top1: 0, top3: 0, top5: 0 },
  };

  for (const item of questions) {
    const [bm25, vector, hybrid] = await Promise.all([
      Promise.resolve(bm25Search(item.query, 5)),
      vectorSearch(item.query, { limit: 5, index }),
      hybridSearch(item.query, { limit: 5, index }),
    ]);

    const byMode: Record<ModeName, SearchHit[]> = {
      BM25: bm25,
      Vector: vector,
      Hybrid: hybrid,
    };

    console.log("\n" + "=".repeat(72));
    console.log(`Q[${item.id}] ${item.query}`);
    console.log(`expected: ${item.expected.join(" | ")}`);

    for (const mode of modes) {
      const hits = byMode[mode];
      const ids = hits.map((hit) => hit.evidenceId);
      if (hitAt(ids, item.expected, 1)) stats[mode].top1 += 1;
      if (hitAt(ids, item.expected, 3)) stats[mode].top3 += 1;
      if (hitAt(ids, item.expected, 5)) stats[mode].top5 += 1;
      console.log(
        `${mode.padEnd(6)} → ${ids.map((id, index) => `${index + 1}.${id}`).join("  ") || "（无）"}`,
      );
    }
  }

  const total = questions.length;
  console.log("\n" + "=".repeat(72));
  console.log("Summary (hit rate)");
  console.log("| 模式 | Top1 | Top3 | Top5 |");
  console.log("|---|---:|---:|---:|");
  for (const mode of modes) {
    const row = stats[mode];
    console.log(
      `| ${mode} | ${pct(row.top1, total)} | ${pct(row.top3, total)} | ${pct(row.top5, total)} |`,
    );
  }
  console.log(`\nN=${total}`);
}

function hitAt(ids: string[], expected: string[], k: number) {
  const top = ids.slice(0, k);
  return expected.some((id) => top.includes(id));
}

function pct(hit: number, total: number) {
  if (total === 0) return "0% (0/0)";
  const value = ((hit / total) * 100).toFixed(0);
  return `${value}% (${hit}/${total})`;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
