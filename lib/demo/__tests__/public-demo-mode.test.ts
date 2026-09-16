import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  deleteStoredDocument,
  importDocumentFile,
  listDocumentChunks,
  listStoredDocuments,
  readDocumentsStore,
  readJobProfile,
  writeJobProfile,
} from "../../documents/store";
import { loadKnowledgeBase } from "../../knowledge/loader";
import { bm25Search } from "../../knowledge/bm25";
import { executeTool } from "../../agent/tools";
import {
  allowAgentDebug,
  DemoModeWriteError,
  DemoQuotaError,
  isPublicDemoMode,
  maxAgentMessageChars,
} from "../mode";
import { loadDemoDocumentsStore, loadDemoJobProfile, resetDemoCache } from "../store";
import {
  cleanupExpiredDemoSessions,
  DEMO_MAX_PARSED_CHARS,
  DEMO_MAX_SESSION_UPLOADS,
  DEMO_MAX_UPLOAD_BYTES,
  DEMO_SESSION_TTL_MS,
  getDemoSessionRoot,
  getDemoSessionsRoot,
  removeDemoSessionDir,
  touchDemoSession,
} from "../ephemeral";
import { createDemoSessionId, runWithDemoSession } from "../session";
import { resolveChatIncludeLegacy } from "../../knowledge/visibility";
import { fillJobFormFields } from "../../job/fill-assist";

const UNIQUE_TOKEN = `NebulaEchoToken_${Date.now()}`;

describe("ephemeral public demo mode", () => {
  let tmpRoot: string;
  let sessionA: string;
  let sessionB: string;

  beforeEach(() => {
    resetDemoCache();
    vi.unstubAllEnvs();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cris-z-demo-test-"));
    vi.stubEnv("CRIS_Z_DEMO_TMP", tmpRoot);
    vi.stubEnv("PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("RETRIEVAL_MODE", "bm25");
    vi.stubEnv("CONTENT_AUDIENCE", "public");
    sessionA = createDemoSessionId();
    sessionB = createDemoSessionId();
  });

  afterEach(() => {
    resetDemoCache();
    vi.unstubAllEnvs();
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("is off by default so local mode is unchanged", () => {
    vi.unstubAllEnvs();
    expect(isPublicDemoMode()).toBe(false);
  });

  it("loads synthetic job profile and never reads .data", () => {
    const profile = readJobProfile();
    expect(profile.name).toBe("张三");
    expect(profile.education[0]?.school).toBe("示例大学");

    const dataProfile = path.join(process.cwd(), ".data", "profile", "job-profile.json");
    if (fs.existsSync(dataProfile)) {
      const privateRaw = fs.readFileSync(dataProfile, "utf8");
      expect(privateRaw).not.toContain('"name": "张三"');
    }
    expect(loadDemoJobProfile().name).toBe("张三");
    expect(() => writeJobProfile(profile)).toThrow(DemoModeWriteError);
  });

  it("merges synthetic documents with session uploads; A cannot see B", async () => {
    const uploaded = await runWithDemoSession(sessionA, async () =>
      importDocumentFile({
        filename: "a-secret.txt",
        buffer: Buffer.from(`Session A note about ${UNIQUE_TOKEN}`, "utf8"),
        knowledgeSpace: "job",
      }),
    );

    await runWithDemoSession(sessionA, () => {
      const docs = listStoredDocuments("job");
      expect(docs.some((doc) => doc.document_id.startsWith("demo-"))).toBe(true);
      expect(docs.some((doc) => doc.document_id === uploaded.document_id)).toBe(true);
      expect(readDocumentsStore().chunks.some((chunk) => chunk.content.includes(UNIQUE_TOKEN))).toBe(
        true,
      );
    });

    await runWithDemoSession(sessionB, () => {
      const docs = listStoredDocuments("job");
      expect(docs.some((doc) => doc.document_id.startsWith("demo-"))).toBe(true);
      expect(docs.some((doc) => doc.document_id === uploaded.document_id)).toBe(false);
      expect(docs.some((doc) => doc.filename === "a-secret.txt")).toBe(false);
      expect(readDocumentsStore().chunks.some((chunk) => chunk.content.includes(UNIQUE_TOKEN))).toBe(
        false,
      );
    });
  });

  it("blocks B from deleting A uploads and blocks synthetic deletes", async () => {
    const uploaded = await runWithDemoSession(sessionA, async () =>
      importDocumentFile({
        filename: "owned-by-a.txt",
        buffer: Buffer.from("owned by A", "utf8"),
        knowledgeSpace: "temporary",
      }),
    );

    await runWithDemoSession(sessionB, () => {
      expect(deleteStoredDocument(uploaded.document_id)).toBe(false);
    });

    await runWithDemoSession(sessionA, () => {
      expect(() => deleteStoredDocument("demo-doc-basics")).toThrow(DemoModeWriteError);
      expect(deleteStoredDocument(uploaded.document_id)).toBe(true);
      expect(listStoredDocuments().some((doc) => doc.document_id === uploaded.document_id)).toBe(
        false,
      );
    });
  });

  it("uses resume-aware chunking for resume uploads", async () => {
    const resumeText = `
个人简历
教育背景
2020-09 ~ 2024-06\t示例大学\t计算机专业（本科）
实习经验
2024-07 ~ 2024-09\t云桥智能\t产品实习生
• 负责 NebulaResumeAlpha 的需求梳理
`;
    const doc = await runWithDemoSession(sessionA, async () =>
      importDocumentFile({
        filename: "resume.txt",
        buffer: Buffer.from(resumeText, "utf8"),
        knowledgeSpace: "job",
        contentType: "resume",
      }),
    );
    expect(doc.content_type).toBe("resume");

    await runWithDemoSession(sessionA, () => {
      const chunks = listDocumentChunks("job").filter((chunk) => chunk.document_id === doc.document_id);
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.some((chunk) => chunk.company === "云桥智能")).toBe(true);
      expect(chunks.some((chunk) => chunk.content.includes("NebulaResumeAlpha"))).toBe(true);
    });
  });

  it("rejects oversized files, upload count, and parsed text limits", async () => {
    await runWithDemoSession(sessionA, async () => {
      await expect(
        importDocumentFile({
          filename: "big.txt",
          buffer: Buffer.alloc(DEMO_MAX_UPLOAD_BYTES + 1, 97),
          knowledgeSpace: "temporary",
        }),
      ).rejects.toMatchObject({ code: "DEMO_FILE_TOO_LARGE", status: 413 });

      for (let i = 0; i < DEMO_MAX_SESSION_UPLOADS; i += 1) {
        await importDocumentFile({
          filename: `ok-${i}.txt`,
          buffer: Buffer.from(`file ${i}`, "utf8"),
          knowledgeSpace: "temporary",
        });
      }

      await expect(
        importDocumentFile({
          filename: "one-too-many.txt",
          buffer: Buffer.from("overflow", "utf8"),
          knowledgeSpace: "temporary",
        }),
      ).rejects.toMatchObject({ code: "DEMO_UPLOAD_LIMIT", status: 413 });
    });

    await runWithDemoSession(sessionB, async () => {
      await expect(
        importDocumentFile({
          filename: "huge-text.txt",
          buffer: Buffer.from("x".repeat(DEMO_MAX_PARSED_CHARS + 1), "utf8"),
          knowledgeSpace: "temporary",
        }),
      ).rejects.toBeInstanceOf(DemoQuotaError);
    });
  });

  it("cleans up expired sessions by TTL", async () => {
    await runWithDemoSession(sessionA, async () => {
      await importDocumentFile({
        filename: "ttl.txt",
        buffer: Buffer.from("ttl payload", "utf8"),
        knowledgeSpace: "temporary",
      });
    });
    expect(fs.existsSync(getDemoSessionRoot(sessionA))).toBe(true);

    const activityPath = path.join(getDemoSessionRoot(sessionA), ".last_activity");
    fs.writeFileSync(activityPath, String(Date.now() - DEMO_SESSION_TTL_MS - 1000), "utf8");
    cleanupExpiredDemoSessions();
    expect(fs.existsSync(getDemoSessionRoot(sessionA))).toBe(false);
  });

  it("never uses shared .data paths for demo session storage", async () => {
    expect(getDemoSessionsRoot()).toBe(path.resolve(tmpRoot));
    await runWithDemoSession(sessionA, async () => {
      const doc = await importDocumentFile({
        filename: "isolation.txt",
        buffer: Buffer.from("not in .data", "utf8"),
        knowledgeSpace: "temporary",
      });
      expect(doc.source_path.includes(".data")).toBe(false);
      expect(doc.source_path.includes(tmpRoot.replace(/\\/g, "/")) || doc.source_path.includes(sessionA)).toBe(
        true,
      );
    });
    const dataDocs = path.join(process.cwd(), ".data", "documents.json");
    if (fs.existsSync(dataDocs)) {
      const raw = fs.readFileSync(dataDocs, "utf8");
      expect(raw).not.toContain("isolation.txt");
    }
  });

  it("makes session uploads searchable via BM25 and search_knowledge sources", async () => {
    const marker = `ZephyrLattice_${Date.now()}`;
    const doc = await runWithDemoSession(sessionA, async () =>
      importDocumentFile({
        filename: "retrievable.txt",
        buffer: Buffer.from(`这份资料专门讨论 ${marker} 检索证据。`, "utf8"),
        knowledgeSpace: "job",
      }),
    );

    await runWithDemoSession(sessionA, async () => {
      const { runWithIncludeLegacy } = await import("../../knowledge/visibility");
      await runWithIncludeLegacy(false, () => {
        const hits = bm25Search(marker, 5, "job");
        expect(hits.some((hit) => hit.evidenceId?.includes(doc.document_id))).toBe(true);
      });

      const { result } = await executeTool(
        "search_knowledge",
        JSON.stringify({ query: marker, knowledge_space: "job" }),
      );
      expect(result.ok).toBe(true);
      const data = result.data as {
        results: Array<{ evidence_id: string; path?: string }>;
      };
      expect(data.results.some((item) => item.evidence_id.startsWith(doc.document_id))).toBe(true);
      expect(result.evidence.some((item) => item.id.startsWith(doc.document_id))).toBe(true);
    });

    await runWithDemoSession(sessionB, async () => {
      const { runWithIncludeLegacy } = await import("../../knowledge/visibility");
      await runWithIncludeLegacy(false, () => {
        const hits = bm25Search(marker, 5, "job");
        expect(hits.some((hit) => hit.evidenceId?.includes(doc.document_id))).toBe(false);
      });
    });
  });

  it("keeps agent limits and production legacy/debug gates", () => {
    expect(maxAgentMessageChars()).toBe(4000);
    vi.stubEnv("NODE_ENV", "development");
    expect(allowAgentDebug(true)).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    expect(resolveChatIncludeLegacy(true, true)).toBe(false);
  });

  it("supports job fill from synthetic profile", () => {
    const fields = fillJobFormFields({
      profile: readJobProfile(),
      fieldsText: "姓名：\n学校：\n公司：\n",
    });
    const byField = Object.fromEntries(fields.map((item) => [item.field, item.value]));
    expect(byField["姓名"]).toBe("张三");
    expect(byField["学校"]).toBe("示例大学");
  });

  it("exposes synthetic evidence without session uploads", async () => {
    const { runWithIncludeLegacy } = await import("../../knowledge/visibility");
    await runWithIncludeLegacy(false, () => {
      const { chunks } = loadKnowledgeBase("job");
      expect(chunks.some((chunk) => chunk.text.includes("示例大学"))).toBe(true);
      expect(loadDemoDocumentsStore().documents.length).toBeGreaterThan(0);
    });
  });
});

describe("local mode with ephemeral demo off", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("continues using .data helpers when demo is off", () => {
    expect(isPublicDemoMode()).toBe(false);
    expect(maxAgentMessageChars()).toBe(8000);
    expect(() => readDocumentsStore()).not.toThrow();
    expect(() => readJobProfile()).not.toThrow();
  });

  it("still imports into local store when demo is off", async () => {
    const doc = await importDocumentFile({
      filename: `local-mode-${Date.now()}.txt`,
      buffer: Buffer.from("local mode still works", "utf8"),
      knowledgeSpace: "temporary",
    });
    expect(doc.source_path.startsWith(".data/") || doc.source_path.includes(".data")).toBe(true);
    expect(deleteStoredDocument(doc.document_id)).toBe(true);
  });
});

describe("demo session helpers", () => {
  it("touches activity and can remove session dirs", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cris-z-demo-helper-"));
    vi.stubEnv("CRIS_Z_DEMO_TMP", root);
    const id = createDemoSessionId();
    touchDemoSession(id);
    expect(fs.existsSync(getDemoSessionRoot(id))).toBe(true);
    removeDemoSessionDir(id);
    expect(fs.existsSync(getDemoSessionRoot(id))).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });
});
