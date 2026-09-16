"use client";

import { useEffect, useState } from "react";
import type { StoredDocument } from "@/lib/documents";
import { KNOWLEDGE_SPACES, type KnowledgeSpaceId } from "@/lib/knowledge/spaces";

export function KnowledgeUploader() {
  const [space, setSpace] = useState<KnowledgeSpaceId>("work");
  const [contentType, setContentType] = useState<"general" | "resume">("general");
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dragOver, setDragOver] = useState(false);

  async function refresh() {
    const response = await fetch("/api/documents");
    const payload = (await response.json()) as { documents?: StoredDocument[] };
    setDocuments(payload.documents ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch("/api/documents");
      const payload = (await response.json()) as { documents?: StoredDocument[] };
      if (!cancelled) {
        setDocuments(payload.documents ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function uploadFile(file: File, overrideContentType?: "general" | "resume") {
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
    setBusy(true);
    await fetch(`/api/documents?document_id=${encodeURIComponent(documentId)}`, {
      method: "DELETE",
    });
    await refresh();
    setBusy(false);
  }

  return (
    <div className="knowledge-panel">
      <p className="privacy-note">
        文件保存在本机 <code>.data/uploads/</code>。当回答需要 DeepSeek 推理时，检索到的相关文本片段会发送到
        DeepSeek API——不是完全本地推理。
      </p>

      <div className="scope-bar">
        <label htmlFor="upload-space">导入到知识空间</label>
        <select
          id="upload-space"
          value={space}
          disabled={busy}
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
          disabled={busy}
          onChange={(event) => setContentType(event.target.value as "general" | "resume")}
        >
          <option value="general">通用文档</option>
          <option value="resume">简历</option>
        </select>
      </div>

      <label
        className={`dropzone ${dragOver ? "active" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const file = event.dataTransfer.files?.[0];
          if (file) {
            void uploadFile(file);
          }
        }}
      >
        <input
          type="file"
          accept=".txt,.md,.markdown,.pdf,.docx"
          disabled={busy}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              const suggested = /简历|resume|cv/i.test(file.name) ? "resume" : contentType;
              if (suggested === "resume") {
                setContentType("resume");
              }
              void uploadFile(file, suggested);
            }
            event.currentTarget.value = "";
          }}
        />
        <strong>{busy ? "导入中…" : "拖拽文件到此处，或点击选择"}</strong>
        <span>支持 .txt / .md / .pdf / .docx</span>
      </label>

      {message ? <p className="status-note">{message}</p> : null}

      <section className="document-list">
        <h2>已导入文档</h2>
        {documents.length === 0 ? <p>还没有文档。先上传一个试试。</p> : null}
        <ul>
          {documents.map((doc) => (
            <li key={doc.document_id}>
              <div>
                <strong>{doc.filename}</strong>
                <span>
                  {doc.knowledge_space} · {doc.document_type}
                  {doc.content_type === "resume" ? " · 简历" : ""} · {doc.chunk_count} 片段
                </span>
              </div>
              <button type="button" disabled={busy} onClick={() => void onDelete(doc.document_id)}>
                删除
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
