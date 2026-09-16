import fs from "node:fs";
import { parsePdfFile } from "../lib/documents/parser";
import { chunkPlainText } from "../lib/documents/chunk";

function redact(s: string) {
  return s
    .replace(/1[3-9]\d{9}/g, "[PHONE]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[EMAIL]")
    .replace(/https?:\/\/\S+/g, "[URL]")
    .replace(/\b\d{17}[\dXx]\b/g, "[ID]");
}

function structureHints(text: string) {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const companies = lines.filter((l) =>
    /(有限公司|科技|物联|大学|电网|网联|赛曙|天翼)/.test(l) && l.length < 40,
  );
  const roles = lines.filter((l) => /(实习|产品经理|测试|助理|工程师)/.test(l) && l.length < 30);
  const dates = lines.filter((l) => /\d{4}\s*[\.\-/年]/.test(l));
  const projects = lines.filter((l) => /(I-Park|国信|机械臂|南方电网|密盒|智会)/i.test(l));
  const bullets = lines.filter((l) => /^[-•·●*]/.test(l) || /^[0-9一二三四五六七八九十]+[、.]/.test(l));
  return { lineCount: lines.length, companies, roles, dates, projects, bullets: bullets.length };
}

async function main() {
  const store = JSON.parse(fs.readFileSync(".data/documents.json", "utf8")) as {
    documents: Array<{ document_id: string; filename: string; source_path: string; chunk_count: number }>;
    chunks: Array<{ document_id: string; section: string; content: string; chunk_index: number }>;
  };
  const resume = store.documents.find((d) => d.filename.includes("简历"));
  if (!resume) {
    throw new Error("resume not found");
  }
  console.log("=== STORED DOC ===");
  console.log({
    id: resume.document_id,
    filename: resume.filename,
    chunks: resume.chunk_count,
  });

  const chunks = store.chunks
    .filter((c) => c.document_id === resume.document_id)
    .sort((a, b) => a.chunk_index - b.chunk_index);

  for (const chunk of chunks) {
    console.log(`\n=== CHUNK ${chunk.section} (${chunk.content.length} chars) ===`);
    console.log("structure hints:", JSON.stringify(structureHints(chunk.content), null, 2));
    console.log("--- preview ---");
    console.log(redact(chunk.content).slice(0, 1500));
  }

  const abs = resume.source_path;
  const buffer = fs.readFileSync(abs);
  const parsed = await parsePdfFile(buffer);
  console.log("\n=== RAW PDF TEXT (redacted preview) ===");
  console.log("total chars:", parsed.text.length);
  console.log(redact(parsed.text).slice(0, 2500));
  console.log("\n=== RAW structure hints ===");
  console.log(JSON.stringify(structureHints(parsed.text), null, 2));

  const plainChunks = chunkPlainText(parsed.text);
  console.log("\n=== CURRENT plain chunk count ===", plainChunks.length);
  for (const piece of plainChunks) {
    console.log(`\nplain ${piece.section} (${piece.content.length}) hints:`, structureHints(piece.content));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
