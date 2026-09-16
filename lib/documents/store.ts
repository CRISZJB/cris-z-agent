import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chunkPlainText, evidenceIdForChunk } from "./chunk";
import { parseFileBuffer } from "./parser";
import { chunkResumeText, parseContentType, type ContentType, type ResumeChunkMeta } from "./resume-chunk";
import type {
  DocumentChunkRecord,
  DocumentsStoreFile,
  JobProfile,
  StoredDocument,
} from "./types";
import { EMPTY_JOB_PROFILE as EMPTY_PROFILE } from "./types";
import { normalizeJobProfile } from "./job-profile";
import type { KnowledgeSpaceId } from "../knowledge/spaces";
import { isKnowledgeSpaceId } from "../knowledge/spaces";
import { assertDemoWritable, isPublicDemoMode } from "../demo/mode";
import { loadDemoDocumentsStore, loadDemoJobProfile } from "../demo/store";

const DATA_ROOT = path.join(process.cwd(), ".data");
const UPLOADS_DIR = path.join(DATA_ROOT, "uploads");
const DOCUMENTS_FILE = path.join(DATA_ROOT, "documents.json");
const JOB_PROFILE_FILE = path.join(DATA_ROOT, "profile", "job-profile.json");

export function getUploadsDir() {
  return UPLOADS_DIR;
}

export function getDocumentsStorePath() {
  return DOCUMENTS_FILE;
}

function ensureDirs() {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(JOB_PROFILE_FILE), { recursive: true });
}

function emptyStore(): DocumentsStoreFile {
  return { version: 1, documents: [], chunks: [] };
}

export function readDocumentsStore(): DocumentsStoreFile {
  if (isPublicDemoMode()) {
    return loadDemoDocumentsStore();
  }
  ensureDirs();
  if (!fs.existsSync(DOCUMENTS_FILE)) {
    return emptyStore();
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DOCUMENTS_FILE, "utf8")) as DocumentsStoreFile;
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

function writeDocumentsStore(store: DocumentsStoreFile) {
  assertDemoWritable();
  ensureDirs();
  fs.writeFileSync(DOCUMENTS_FILE, JSON.stringify(store, null, 2), "utf8");
}

export function listStoredDocuments(knowledgeSpace?: KnowledgeSpaceId | "all") {
  const store = readDocumentsStore();
  if (!knowledgeSpace || knowledgeSpace === "all") {
    return store.documents;
  }
  return store.documents.filter((doc) => doc.knowledge_space === knowledgeSpace);
}

export function getStoredDocument(documentId: string) {
  return readDocumentsStore().documents.find((doc) => doc.document_id === documentId) ?? null;
}

export function getDocumentChunks(documentId: string) {
  return readDocumentsStore().chunks.filter((chunk) => chunk.document_id === documentId);
}

export function listDocumentChunks(knowledgeSpace?: KnowledgeSpaceId | "all") {
  const store = readDocumentsStore();
  if (!knowledgeSpace || knowledgeSpace === "all") {
    return store.chunks;
  }
  return store.chunks.filter((chunk) => chunk.knowledge_space === knowledgeSpace);
}

export function countDocumentsBySpace(): Record<KnowledgeSpaceId, number> {
  const counts = {
    work: 0,
    job: 0,
    study: 0,
    personal: 0,
    temporary: 0,
  } satisfies Record<KnowledgeSpaceId, number>;
  for (const doc of readDocumentsStore().documents) {
    counts[doc.knowledge_space] += 1;
  }
  return counts;
}

export async function importDocumentFile(input: {
  filename: string;
  buffer: Buffer;
  knowledgeSpace: KnowledgeSpaceId;
  contentType?: ContentType;
}): Promise<StoredDocument> {
  assertDemoWritable();
  if (!isKnowledgeSpaceId(input.knowledgeSpace)) {
    throw new Error("无效的知识空间。");
  }

  const contentType = parseContentType(input.contentType);
  const parsed = await parseFileBuffer(input.buffer, input.filename);
  if (!parsed.text.trim()) {
    throw new Error("文件解析后没有可用文本。");
  }

  ensureDirs();
  const documentId = `doc-${createHash("sha1")
    .update(`${input.filename}-${Date.now()}-${randomUUID()}`)
    .digest("hex")
    .slice(0, 12)}`;
  const safeName = input.filename.replace(/[^\w.\u4e00-\u9fff-]+/g, "_");
  const storedName = `${documentId}-${safeName}`;
  const sourcePath = path.join(UPLOADS_DIR, storedName);
  fs.writeFileSync(sourcePath, input.buffer);

  const pieces =
    contentType === "resume" ? chunkResumeText(parsed.text) : chunkPlainText(parsed.text);
  // Safety: never drop content if resume chunker returns nothing.
  const effectivePieces =
    pieces.length > 0 ? pieces : chunkPlainText(parsed.text);

  const chunkRecords: DocumentChunkRecord[] = effectivePieces.map((piece) => {
    const resumeMeta: ResumeChunkMeta | undefined =
      "meta" in piece ? (piece.meta as ResumeChunkMeta | undefined) : undefined;
    return {
      evidence_id: evidenceIdForChunk(documentId, piece.index),
      document_id: documentId,
      filename: input.filename,
      knowledge_space: input.knowledgeSpace,
      section: piece.section,
      content: piece.content,
      chunk_index: piece.index,
      content_type: contentType,
      section_type: resumeMeta?.section_type,
      company: resumeMeta?.company,
      role: resumeMeta?.role,
      date_range: resumeMeta?.date_range,
      school: resumeMeta?.school,
      degree: resumeMeta?.degree,
      major: resumeMeta?.major,
      affiliation_unknown: resumeMeta?.affiliation_unknown,
    };
  });

  const document: StoredDocument = {
    document_id: documentId,
    filename: input.filename,
    knowledge_space: input.knowledgeSpace,
    document_type: parsed.documentType,
    content_type: contentType,
    imported_at: new Date().toISOString(),
    source_path: path.relative(process.cwd(), sourcePath).split(path.sep).join("/"),
    char_count: parsed.text.length,
    chunk_count: chunkRecords.length,
  };

  const store = readDocumentsStore();
  store.documents.unshift(document);
  store.chunks = [...chunkRecords, ...store.chunks.filter((chunk) => chunk.document_id !== documentId)];
  writeDocumentsStore(store);
  return document;
}

export function deleteStoredDocument(documentId: string) {
  assertDemoWritable();
  const store = readDocumentsStore();
  const existing = store.documents.find((doc) => doc.document_id === documentId);
  if (!existing) {
    return false;
  }
  store.documents = store.documents.filter((doc) => doc.document_id !== documentId);
  store.chunks = store.chunks.filter((chunk) => chunk.document_id !== documentId);
  writeDocumentsStore(store);
  const absolute = path.join(process.cwd(), existing.source_path);
  if (fs.existsSync(absolute)) {
    fs.unlinkSync(absolute);
  }
  return true;
}

export function readJobProfile(): JobProfile {
  if (isPublicDemoMode()) {
    return loadDemoJobProfile();
  }
  ensureDirs();
  if (!fs.existsSync(JOB_PROFILE_FILE)) {
    return structuredClone(EMPTY_PROFILE);
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(JOB_PROFILE_FILE, "utf8")) as unknown;
    return normalizeJobProfile(parsed);
  } catch {
    return structuredClone(EMPTY_PROFILE);
  }
}

export function writeJobProfile(profile: JobProfile) {
  assertDemoWritable();
  ensureDirs();
  const normalized = normalizeJobProfile(profile);
  fs.writeFileSync(JOB_PROFILE_FILE, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

export { EMPTY_PROFILE as EMPTY_JOB_PROFILE };
