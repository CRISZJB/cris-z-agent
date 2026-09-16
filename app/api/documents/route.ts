import { NextRequest, NextResponse } from "next/server";
import {
  deleteStoredDocument,
  hideAllSyntheticDemoDocuments,
  importDocumentFile,
  listStoredDocuments,
} from "@/lib/documents";
import { isKnowledgeSpaceId } from "@/lib/knowledge/spaces";
import {
  DemoModeWriteError,
  DemoQuotaError,
  demoForbiddenJson,
  demoQuotaJson,
  isPublicDemoMode,
  isSyntheticDemoDocumentId,
} from "@/lib/demo/mode";
import { withDemoSessionContext } from "@/lib/demo/request";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return withDemoSessionContext(request, () => {
    const space = request.nextUrl.searchParams.get("knowledge_space") ?? "all";
    const scope = space === "all" || isKnowledgeSpaceId(space) ? space : "all";
    const documents = listStoredDocuments(scope);
    return NextResponse.json({
      documents,
      public_demo_mode: isPublicDemoMode(),
      ephemeral_demo: isPublicDemoMode(),
      has_visible_synthetic: documents.some((doc) => isSyntheticDemoDocumentId(doc.document_id)),
    });
  });
}

export async function POST(request: NextRequest) {
  return withDemoSessionContext(request, async () => {
    try {
      const form = await request.formData();
      const file = form.get("file");
      const knowledgeSpace = String(form.get("knowledge_space") ?? "");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "请选择要导入的文件。" }, { status: 400 });
      }
      if (!isKnowledgeSpaceId(knowledgeSpace)) {
        return NextResponse.json({ error: "请选择有效的知识空间。" }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const contentType = String(form.get("content_type") ?? "general");
      const document = await importDocumentFile({
        filename: file.name,
        buffer,
        knowledgeSpace,
        contentType: contentType === "resume" ? "resume" : "general",
      });
      return NextResponse.json({ document });
    } catch (error) {
      if (error instanceof DemoQuotaError) {
        return demoQuotaJson(error);
      }
      if (error instanceof DemoModeWriteError) {
        return demoForbiddenJson(error.message);
      }
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "导入失败。" },
        { status: 400 },
      );
    }
  });
}

export async function DELETE(request: NextRequest) {
  return withDemoSessionContext(request, () => {
    const mode = request.nextUrl.searchParams.get("mode");
    try {
      if (mode === "hide_all_demo") {
        if (!isPublicDemoMode()) {
          return NextResponse.json({ error: "仅公开演示模式支持清空示例资料。" }, { status: 400 });
        }
        const hidden = hideAllSyntheticDemoDocuments();
        return NextResponse.json({ ok: true, hidden, mode: "hide_all_demo" });
      }
      const documentId = request.nextUrl.searchParams.get("document_id");
      if (!documentId) {
        return NextResponse.json({ error: "缺少 document_id。" }, { status: 400 });
      }
      const ok = deleteStoredDocument(documentId);
      if (!ok) {
        return NextResponse.json({ error: "文档不存在。" }, { status: 404 });
      }
      return NextResponse.json({
        ok: true,
        hidden: isPublicDemoMode() && isSyntheticDemoDocumentId(documentId),
      });
    } catch (error) {
      if (error instanceof DemoModeWriteError) {
        return demoForbiddenJson(error.message);
      }
      throw error;
    }
  });
}
