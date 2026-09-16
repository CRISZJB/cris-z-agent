import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DocumentsStoreFile } from "../documents/types";
import { isValidDemoSessionId } from "./session";

export const DEMO_SESSION_TTL_MS = 60 * 60 * 1000;
export const DEMO_MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
export const DEMO_MAX_SESSION_UPLOADS = 5;
export const DEMO_MAX_PARSED_CHARS = 100_000;

const ACTIVITY_FILE = ".last_activity";

export function getDemoSessionsRoot(): string {
  const override = process.env.CRIS_Z_DEMO_TMP?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(os.tmpdir(), "cris-z-agent-demo");
}

export function getDemoSessionRoot(sessionId: string): string {
  if (!isValidDemoSessionId(sessionId)) {
    throw new Error("无效的演示会话 ID。");
  }
  return path.join(getDemoSessionsRoot(), sessionId);
}

export function getDemoSessionDocumentsPath(sessionId: string): string {
  return path.join(getDemoSessionRoot(sessionId), "documents.json");
}

export function getDemoSessionUploadsDir(sessionId: string): string {
  return path.join(getDemoSessionRoot(sessionId), "uploads");
}

export function getDemoSessionStatePath(sessionId: string): string {
  return path.join(getDemoSessionRoot(sessionId), "session-state.json");
}

export type DemoSessionState = {
  hidden_demo_document_ids: string[];
};

function emptySessionState(): DemoSessionState {
  return { hidden_demo_document_ids: [] };
}

export function readDemoSessionState(sessionId: string): DemoSessionState {
  const filePath = getDemoSessionStatePath(sessionId);
  if (!fs.existsSync(filePath)) {
    return emptySessionState();
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<DemoSessionState>;
    const ids = Array.isArray(parsed.hidden_demo_document_ids)
      ? parsed.hidden_demo_document_ids.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];
    return { hidden_demo_document_ids: [...new Set(ids)] };
  } catch {
    return emptySessionState();
  }
}

export function writeDemoSessionState(sessionId: string, state: DemoSessionState): void {
  ensureDemoSessionDirs(sessionId);
  fs.writeFileSync(
    getDemoSessionStatePath(sessionId),
    JSON.stringify(
      { hidden_demo_document_ids: [...new Set(state.hidden_demo_document_ids)] } satisfies DemoSessionState,
      null,
      2,
    ),
    "utf8",
  );
  touchDemoSession(sessionId);
}

export function hideDemoDocumentIds(sessionId: string, documentIds: string[]): string[] {
  const current = readDemoSessionState(sessionId);
  const next = [...new Set([...current.hidden_demo_document_ids, ...documentIds])];
  writeDemoSessionState(sessionId, { hidden_demo_document_ids: next });
  return next;
}

export function ensureDemoSessionDirs(sessionId: string): string {
  const root = getDemoSessionRoot(sessionId);
  fs.mkdirSync(getDemoSessionUploadsDir(sessionId), { recursive: true });
  return root;
}

export function touchDemoSession(sessionId: string): void {
  ensureDemoSessionDirs(sessionId);
  fs.writeFileSync(path.join(getDemoSessionRoot(sessionId), ACTIVITY_FILE), String(Date.now()), "utf8");
}

export function getDemoSessionLastActivityMs(sessionId: string): number {
  const activityPath = path.join(getDemoSessionRoot(sessionId), ACTIVITY_FILE);
  try {
    if (fs.existsSync(activityPath)) {
      const raw = Number(fs.readFileSync(activityPath, "utf8"));
      if (Number.isFinite(raw) && raw > 0) {
        return raw;
      }
    }
  } catch {
    // fall through
  }
  try {
    return fs.statSync(getDemoSessionRoot(sessionId)).mtimeMs;
  } catch {
    return 0;
  }
}

function emptyStore(): DocumentsStoreFile {
  return { version: 1, documents: [], chunks: [] };
}

export function readSessionDocumentsStore(sessionId: string): DocumentsStoreFile {
  const filePath = getDemoSessionDocumentsPath(sessionId);
  if (!fs.existsSync(filePath)) {
    return emptyStore();
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as DocumentsStoreFile;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.documents)) {
      return emptyStore();
    }
    return {
      version: 1,
      documents: (parsed.documents ?? []).map((doc) => ({
        ...doc,
        content_type: doc.content_type === "resume" ? "resume" : "general",
      })),
      chunks: parsed.chunks ?? [],
    };
  } catch {
    return emptyStore();
  }
}

export function writeSessionDocumentsStore(sessionId: string, store: DocumentsStoreFile): void {
  ensureDemoSessionDirs(sessionId);
  fs.writeFileSync(
    getDemoSessionDocumentsPath(sessionId),
    JSON.stringify(
      {
        version: 1,
        documents: store.documents,
        chunks: store.chunks,
      } satisfies DocumentsStoreFile,
      null,
      2,
    ),
    "utf8",
  );
  touchDemoSession(sessionId);
}

/** Best-effort TTL cleanup. Failures must never block the request. */
export function cleanupExpiredDemoSessions(now = Date.now()): void {
  try {
    const root = getDemoSessionsRoot();
    if (!fs.existsSync(root)) {
      return;
    }
    for (const name of fs.readdirSync(root)) {
      if (!isValidDemoSessionId(name)) {
        continue;
      }
      const last = getDemoSessionLastActivityMs(name);
      if (!last || now - last > DEMO_SESSION_TTL_MS) {
        fs.rmSync(path.join(root, name), { recursive: true, force: true });
      }
    }
  } catch {
    // ignore
  }
}

export function removeDemoSessionDir(sessionId: string): void {
  try {
    fs.rmSync(getDemoSessionRoot(sessionId), { recursive: true, force: true });
  } catch {
    // ignore
  }
}
