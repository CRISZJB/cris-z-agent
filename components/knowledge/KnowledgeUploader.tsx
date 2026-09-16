"use client";

import { useEffect, useState } from "react";
import type { StoredDocument } from "@/lib/documents";
import { KNOWLEDGE_SPACES, type KnowledgeSpaceId } from "@/lib/knowledge/spaces";

type Props = {
  publicDemoMode?: boolean;
};

export function KnowledgeUploader({ publicDemoMode = false }: Props) {
  const [space, setSpace] = useState<KnowledgeSpaceId>("work");
  const [contentType, setContentType] = useState<"general" | "resume">("general");
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [demoMode, setDemoMode] = useState(publicDemoMode);
  const writeDisabled = demoMode || busy;

  async function refresh() {
    const response = await fetch("/api/documents");
    const payload = (await response.json()) as {
      documents?: StoredDocument[];
      public_demo_mode?: boolean;
    };
    setDocuments(payload.documents ?? []);
    if (typeof payload.public_demo_mode === "boolean") {
      setDemoMode(payload.public_demo_mode);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch("/api/documents");
      const payload = (await response.json()) as {
        documents?: StoredDocument[];
        public_demo_mode?: boolean;
      };
      if (!cancelled) {
        setDocuments(payload.documents ?? []);
        if (typeof payload.public_demo_mode === "boolean") {
          setDemoMode(payload.public_demo_mode);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function uploadFile(file: File, overrideContentType?: "general" | "resume") {
    if (demoMode) {
      setMessage("公开演示模式暂不支持上传个人文件。");
      return;
    }
    setBusy(true);
    setMessage("");
    const resolvedType = overrideContentType ?? contentType;
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("knowledge_space", space);
      form.set("content_type", resolvedType);
      const response = await fetch("/api/documents", { method: "POST", body: form });
      const payload = (await response.json()) as { error?: string; document?: StoredDocument };
      if (!response.ok) {
        throw new Error(payload.error || "导入失败");
      }
      setMessage(`已导入：${payload.document?.filename}`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导入失败");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(documentId: string) {
    if (demoMode) {
      setMessage("公开演示模式暂不支持删除文件。");
      return;
    }
    setBusy(true);
    await fetch(`/api/documents?document_id=${encodeURIComponent(documentId)}`, {
      method: "DELETE",
    });
    await refresh();
    setBusy(false);
  }

  return (
    <div className="knowledge-panel">
      {demoMode ? (
        <p className="privacy-note">
          公开演示模式暂不支持上传个人文件。下方列表为匿名示例资料，仅供体验检索与回答。
        </p>
      ) : (
        <p className="privacy-note">
          文件保存在本机 <code>.data/uploads/</code>。当回答需要 DeepSeek 推理时，检索到的相关文本片段会发送到
          DeepSeek API——不是完全本地推理。
        </p>
      )}

      <div className="scope-bar">
        <label htmlFor="upload-space">导入到知识空间</label>
        <select
          id="upload-space"
          value={space}
          disabled={writeDisabled}
          onChange={(event) => setSpace(event.target.value as KnowledgeSpaceId)}
        >
          {KNOWLEDGE_SPACES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <label htmlFor="upload-content-type">内容类型</label>
        <select
          id="upload-content-type"
          value={contentType}
          disabled={writeDisabled}
          onChange={(event) => setContentType(event.target.value as "general" | "resume")}
        >
          <option value="general">通用文档</option>
          <option value="resume">简历</option>
        </select>
      </div>

      <label
        className={`dropzone${dragOver ? " active" : ""}${demoMode ? " dropzone-disabled" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!demoMode) {
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          if (demoMode) {
            setMessage("公开演示模式暂不支持上传个人文件。");
            return;
          }
          const file = event.dataTransfer.files?.[0];
          if (file) {
            void uploadFile(file);
          }
        }}
      >
        <input
          type="file"
          accept=".txt,.md,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={writeDisabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void uploadFile(file);
            }
            event.target.value = "";
          }}
        />
        {demoMode
          ? "公开演示模式暂不支持上传个人文件。"
          : busy
            ? "导入中…"
            : "拖拽文件到此处，或点击选择（TXT / MD / PDF / DOCX）"}
      </label>

      {message ? <p className="status-note">{message}</p> : null}

      <ul className="document-list">
        {documents.map((doc) => (
          <li key={doc.document_id}>
            <div>
              <strong>{doc.filename}</strong>
              <span>
                {doc.knowledge_space} · {doc.content_type === "resume" ? "简历" : "通用"} ·{" "}
                {doc.chunk_count} 片段
              </span>
            </div>
            <button type="button" disabled={writeDisabled} onClick={() => void onDelete(doc.document_id)}>
              删除
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
