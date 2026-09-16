import { afterEach, describe, expect, it } from "vitest";
import { chunkPlainText, evidenceIdForChunk } from "../chunk";
import { detectDocumentType } from "../parser";
import {
  deleteStoredDocument,
  importDocumentFile,
  listDocumentChunks,
  listStoredDocuments,
} from "../store";

describe("documents", () => {
  const createdIds: string[] = [];

  afterEach(() => {
    for (const id of createdIds.splice(0)) {
      deleteStoredDocument(id);
    }
  });

  it("detects supported types", () => {
    expect(detectDocumentType("a.txt")).toBe("txt");
    expect(detectDocumentType("a.md")).toBe("md");
    expect(detectDocumentType("a.pdf")).toBe("pdf");
    expect(detectDocumentType("a.docx")).toBe("docx");
    expect(detectDocumentType("a.xlsx")).toBeNull();
  });

  it("chunks text with stable evidence ids", () => {
    const chunks = chunkPlainText("第一段内容。\n\n第二段内容。\n\n第三段内容。");
    expect(chunks.length).toBeGreaterThan(0);
    expect(evidenceIdForChunk("doc-abc", 1)).toBe("doc-abc:chunk-001");
  });

  it("imports txt into a knowledge space and creates chunks", async () => {
    const doc = await importDocumentFile({
      filename: `test-import-${Date.now()}.txt`,
      buffer: Buffer.from("这是一份工作备忘录。\n\n主要内容是用户增长实验。", "utf8"),
      knowledgeSpace: "work",
    });
    createdIds.push(doc.document_id);
    expect(doc.knowledge_space).toBe("work");
    expect(doc.chunk_count).toBeGreaterThan(0);
    const listed = listStoredDocuments("work");
    expect(listed.some((item) => item.document_id === doc.document_id)).toBe(true);
    const chunks = listDocumentChunks("work");
    expect(chunks.some((chunk) => chunk.document_id === doc.document_id)).toBe(true);
    expect(chunks.find((chunk) => chunk.document_id === doc.document_id)?.evidence_id).toMatch(
      /:chunk-001$/,
    );
  });
});
