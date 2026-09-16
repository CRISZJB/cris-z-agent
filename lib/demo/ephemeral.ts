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
