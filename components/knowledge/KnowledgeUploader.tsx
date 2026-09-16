"use client";

import { useEffect, useState } from "react";
import type { StoredDocument } from "@/lib/documents";
import { KNOWLEDGE_SPACES, type KnowledgeSpaceId } from "@/lib/knowledge/spaces";

type Props = {
  publicDemoMode?: boolean;
};

function isSyntheticDoc(doc: StoredDocument) {
  return doc.document_id.startsWith("demo-");
}

export function KnowledgeUploader({ publicDemoMode = false }: Props) {
  const [space, setSpace] = useState<KnowledgeSpaceId>("work");
  const [contentType, setContentType] = useState<"general" | "resume">("general");
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [demoMode, setDemoMode] = useState(publicDemoMode);
  const [hasVisibleSynthetic, setHasVisibleSynthetic] = useState(publicDemoMode);

  async function refresh() {
    const response = await fetch("/api/documents");
    const payload = (await response.json()) as {
      documents?: StoredDocument[];
      public_demo_mode?: boolean;
      has_visible_synthetic?: boolean;
    };
    const nextDocs = payload.documents ?? [];
    setDocuments(nextDocs);
    if (typeof payload.public_demo_mode === "boolean") {
      setDemoMode(payload.public_demo_mode);
    }
    const visible =
      typeof payload.has_visible_synthetic === "boolean"
        ? payload.has_visible_synthetic
        : nextDocs.some(isSyntheticDoc);
    setHasVisibleSynthetic(visible);
    return { documents: nextDocs, hasVisibleSynthetic: visible };
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch("/api/documents");
      const payload = (await response.json()) as {
        documents?: StoredDocument[];
        public_demo_mode?: boolean;
        has_visible_synthetic?: boolean;
      };
      if (!cancelled) {
        const nextDocs = payload.documents ?? [];
        setDocuments(nextDocs);
        if (typeof payload.public_demo_mode === "boolean") {
          setDemoMode(payload.public_demo_mode);
        }
        setHasVisibleSynthetic(
          typeof payload.has_visible_synthetic === "boolean"
            ? payload.has_visible_synthetic
            : nextDocs.some(isSyntheticDoc),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function uploadFile(file: File) {
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("knowledge_space", space);
      form.set("content_type", contentType);
      const response = await fetch("/api/documents", { method: "POST", body: form });
      const payload = (await response.json()) as {
        error?: string;
        code?: string;
        document?: StoredDocument;
      };
      if (!response.ok) {
        throw new Error(payload.error || "导入失败");
      }
      const next = await refresh();
      if (demoMode && next.hasVisibleSynthetic) {
        setMessage("已上传自己的资料。若希望只基于你的文档检索，可清空示例资料。");
      } else {
        setMessage(`已导入：${payload.document?.filename}`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导入失败");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(documentId: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/documents?document_id=${encodeURIComponent(documentId)}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "操作失败");
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function clearSyntheticDocs() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/documents?mode=hide_all_demo", { method: "DELETE" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "清空示例资料失败");
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "清空示例资料失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="knowledge-panel">
      {demoMode ? (
        <div className="demo-readonly-callout" role="status">
          <p className="demo-readonly-title">临时演示知识库</p>
          <p>
            你可以上传 TXT / MD / PDF / DOCX，包括简历。文件仅用于当前演示会话，不做长期保存，服务休眠、重启或会话过期后可能被清除。
          </p>
          <p>请勿上传高度敏感信息。</p>
        </div>
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

      <div
        className={`dropzone${dragOver ? " active" : ""}`}
        role="group"
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
        <label className="dropzone-label">
          <input
            type="file"
            accept=".txt,.md,.markdown,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void uploadFile(file);
              }
              event.target.value = "";
            }}
          />
          {busy
            ? "导入中…"
            : demoMode
              ? "拖拽或选择文件（临时会话上传 · TXT / MD / PDF / DOCX，含简历）"
              : "拖拽文件到此处，或点击选择（TXT / MD / PDF / DOCX）"}
        </label>
      </div>

      {demoMode && hasVisibleSynthetic ? (
        <div className="demo-clear-row">
          <button type="button" disabled={busy} onClick={() => void clearSyntheticDocs()}>
            清空示例资料
          </button>
          <span className="demo-inline-hint">仅对当前演示会话生效，不会影响其他访客。</span>
        </div>
      ) : null}

      {demoMode && !hasVisibleSynthetic ? (
        <p className="privacy-note">示例资料已从本次会话移除。你可以上传自己的文档进行体验。</p>
      ) : null}

      {message ? <p className="status-note">{message}</p> : null}

      <ul className="document-list">
        {documents.map((doc) => {
          const synthetic = isSyntheticDoc(doc);
          return (
            <li key={doc.document_id}>
              <div>
                <strong>{doc.filename}</strong>
                <span className="document-tags">
                  {synthetic ? <span className="doc-tag">示例资料</span> : null}
                  {!synthetic && demoMode ? <span className="doc-tag">本次会话上传</span> : null}
                  {doc.content_type === "resume" ? <span className="doc-tag">简历</span> : null}
                </span>
                <span>
                  {doc.knowledge_space} · {doc.content_type === "resume" ? "简历" : "通用"} ·{" "}
                  {doc.chunk_count} 片段
                </span>
              </div>
              <div className="document-actions">
                <button type="button" disabled={busy} onClick={() => void onDelete(doc.document_id)}>
                  {synthetic ? "从本次会话移除" : "删除"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
