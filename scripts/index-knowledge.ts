import path from "node:path";
import { buildKnowledgeIndex, resetIndexCache } from "../lib/knowledge/index-store";
import { getRetrievalConfig } from "../lib/knowledge/retrieval-config";
import { getContentAudience } from "../lib/knowledge/visibility";

async function main() {
  resetIndexCache();
  const config = getRetrievalConfig();
  const indexPath = path.resolve(process.cwd(), config.indexPath);

  console.log(`CONTENT_AUDIENCE=${getContentAudience()}`);
  console.log(`EMBEDDING_MODEL=${config.embeddingModel}`);
  console.log(`INDEX_PATH=${indexPath}`);
  console.log("Building knowledge index…");

  const started = Date.now();
  const result = await buildKnowledgeIndex({ force: process.argv.includes("--force") });
  const elapsedMs = Date.now() - started;

  console.log(
    JSON.stringify(
      {
        rebuilt: result.rebuilt,
        reason: result.reason,
        audience: result.index.audience,
        model: result.index.model,
        records: result.index.records.length,
        dimensions: result.index.dimensions,
        contentHash: result.index.contentHash,
        elapsedMs,
        indexPath,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
