import fs from "node:fs";
import path from "node:path";
import type { DocumentsStoreFile, JobProfile } from "../documents/types";
import { normalizeJobProfile } from "../documents/job-profile";
import { isPublicDemoMode } from "./mode";

const DEMO_ROOT = path.join(process.cwd(), "demo");
const DEMO_JOB_PROFILE = path.join(DEMO_ROOT, "job-profile.json");
const DEMO_DOCUMENTS = path.join(DEMO_ROOT, "documents.json");

let cachedProfile: JobProfile | null = null;
let cachedStore: DocumentsStoreFile | null = null;

export function getDemoRoot() {
  return DEMO_ROOT;
}

export function resetDemoCache() {
  cachedProfile = null;
  cachedStore = null;
}

/** Load anonymous tracked Job Profile. Never falls back to `.data`. */
export function loadDemoJobProfile(): JobProfile {
  if (cachedProfile) {
    return structuredClone(cachedProfile);
  }
  if (!fs.existsSync(DEMO_JOB_PROFILE)) {
    throw new Error("公开演示数据缺失：demo/job-profile.json");
  }
  const raw = JSON.parse(fs.readFileSync(DEMO_JOB_PROFILE, "utf8")) as unknown;
  cachedProfile = normalizeJobProfile(raw);
  return structuredClone(cachedProfile);
}

/** Load anonymous tracked document store. Never falls back to `.data`. */
export function loadDemoDocumentsStore(): DocumentsStoreFile {
  if (cachedStore) {
    return structuredClone(cachedStore);
  }
  if (!fs.existsSync(DEMO_DOCUMENTS)) {
    throw new Error("公开演示数据缺失：demo/documents.json");
  }
  const parsed = JSON.parse(fs.readFileSync(DEMO_DOCUMENTS, "utf8")) as DocumentsStoreFile;
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.documents) || !Array.isArray(parsed.chunks)) {
    throw new Error("公开演示数据格式无效：demo/documents.json");
  }
  cachedStore = {
    version: 1,
    documents: parsed.documents,
    chunks: parsed.chunks,
  };
  return structuredClone(cachedStore);
}

/** Guard helper for tests: ensure demo paths are used only in demo mode. */
export function assertDemoDataIsolation() {
  if (!isPublicDemoMode()) {
    return;
  }
  // Touching these loaders must succeed without reading `.data`.
  loadDemoJobProfile();
  loadDemoDocumentsStore();
}
