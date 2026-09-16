import type { DocumentType } from "./types";

export async function parseTextFile(buffer: Buffer): Promise<string> {
  return buffer.toString("utf8");
}

export async function parseMarkdownFile(buffer: Buffer): Promise<string> {
  return buffer.toString("utf8");
}

export async function parsePdfFile(buffer: Buffer): Promise<{ text: string; pageCount?: number }> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const info = await parser.getInfo().catch(() => null);
    return {
      text: (result.text || "").trim(),
      pageCount: info?.total ?? result.total ?? undefined,
    };
  } finally {
    await parser.destroy?.();
  }
}

export async function parseDocxFile(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return (result.value || "").trim();
}

export function detectDocumentType(filename: string): DocumentType | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".txt")) return "txt";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "md";
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  return null;
}

export async function parseFileBuffer(
  buffer: Buffer,
  filename: string,
): Promise<{ text: string; documentType: DocumentType; pageCount?: number }> {
  const documentType = detectDocumentType(filename);
  if (!documentType) {
    throw new Error("不支持的文件类型。第一版支持 .txt / .md / .pdf / .docx。");
  }

  if (documentType === "txt") {
    return { text: await parseTextFile(buffer), documentType };
  }
  if (documentType === "md") {
    return { text: await parseMarkdownFile(buffer), documentType };
  }
  if (documentType === "pdf") {
    const parsed = await parsePdfFile(buffer);
    return { text: parsed.text, documentType, pageCount: parsed.pageCount };
  }
  return { text: await parseDocxFile(buffer), documentType };
}
