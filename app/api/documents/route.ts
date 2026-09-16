import { NextRequest } from "next/server";
import {
  deleteStoredDocument,
  importDocumentFile,
  listStoredDocuments,
} from "@/lib/documents";
import { isKnowledgeSpaceId } from "@/lib/knowledge/spaces";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const space = request.nextUrl.searchParams.get("knowledge_space") ?? "all";
  const scope = space === "all" || isKnowledgeSpaceId(space) ? space : "all";
  return Response.json({ documents: listStoredDocuments(scope) });
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const knowledgeSpace = String(form.get("knowledge_space") ?? "");
    if (!(file instanceof File)) {
      return Response.json({ error: "请选择要导入的文件。" }, { status: 400 });
    }
    if (!isKnowledgeSpaceId(knowledgeSpace)) {
      return Response.json({ error: "请选择有效的知识空间。" }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = String(form.get("content_type") ?? "general");
    const document = await importDocumentFile({
      filename: file.name,
      buffer,
      knowledgeSpace,
      contentType: contentType === "resume" ? "resume" : "general",
    });
    return Response.json({ document });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "导入失败。" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const documentId = request.nextUrl.searchParams.get("document_id");
  if (!documentId) {
    return Response.json({ error: "缺少 document_id。" }, { status: 400 });
  }
  const ok = deleteStoredDocument(documentId);
  if (!ok) {
    return Response.json({ error: "文档不存在。" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
