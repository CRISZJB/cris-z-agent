import fs from "node:fs";
import path from "node:path";
import { deleteStoredDocument, importDocumentFile, listDocumentChunks } from "../lib/documents";
import { runAgent } from "../lib/agent/agent";
import { DeepSeekApiError } from "../lib/agent/deepseek";
import { runWithChatKnowledgeContext } from "../lib/knowledge/visibility";
import { preparePublicEvalEnv } from "./eval-env";

preparePublicEvalEnv();

function redact(s: string) {
  return s
    .replace(/1[3-9]\d{9}/g, "[PHONE]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[EMAIL]");
}

async function main() {
  const storePath = path.join(process.cwd(), ".data", "documents.json");
  const store = JSON.parse(fs.readFileSync(storePath, "utf8")) as {
    documents: Array<{ document_id: string; filename: string; source_path: string }>;
  };
  const old = store.documents.find((doc) => doc.filename.includes("简历"));
  if (!old) {
    throw new Error("resume pdf not found in store");
  }
  const abs = path.join(process.cwd(), old.source_path);
  const buffer = fs.readFileSync(abs);
  const filename = old.filename;
  deleteStoredDocument(old.document_id);

  const doc = await importDocumentFile({
    filename,
    buffer,
    knowledgeSpace: "job",
    contentType: "resume",
  });
  console.log("reimported", {
    id: doc.document_id,
    content_type: doc.content_type,
    chunk_count: doc.chunk_count,
  });

  const chunks = listDocumentChunks("job").filter((chunk) => chunk.document_id === doc.document_id);
  for (const chunk of chunks) {
    console.log("\n---", chunk.section, "---");
    console.log({
      section_type: chunk.section_type,
      company: chunk.company,
      role: chunk.role,
      date_range: chunk.date_range,
      school: chunk.school,
      major: chunk.major,
      chars: chunk.content.length,
    });
    console.log(redact(chunk.content).slice(0, 280));
  }

  const questions = [
    "把我的每段实习按 公司 / 岗位 / 时间 / 职责 整理出来。",
    "I-Park 项目属于哪段经历？",
    "国信智会 / 国信密盒属于哪段经历？",
    "南方电网相关工作属于哪段经历？",
  ];

  for (const q of questions) {
    console.log("\n" + "=".repeat(72));
    console.log("Q:", q);
    try {
      const result = await runWithChatKnowledgeContext(
        { audience: "public", includeLegacy: false },
        () => runAgent([{ role: "user", content: q }], { debug: true }),
      );
      console.log("tools:", (result.debug?.toolCalls ?? []).map((t) => t.name).join(" -> ") || "(none)");
      console.log(
        "sources:",
        result.sources
          .map((s) => `${s.sourceName} | ${s.section} | company=${s.company ?? ""} role=${s.role ?? ""}`)
          .join("\n  ") || "(none)",
      );
      console.log("answer:\n" + redact(result.answer).slice(0, 900));
    } catch (error) {
      const message = error instanceof DeepSeekApiError ? error.message : String(error);
      console.log("ERROR:", message.replace(/sk-[a-zA-Z0-9]+/g, "[redacted]"));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
