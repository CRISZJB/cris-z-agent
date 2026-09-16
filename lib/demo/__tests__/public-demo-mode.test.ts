import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";
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
import {
  allowAgentDebug,
  DemoModeWriteError,
  isPublicDemoMode,
  maxAgentMessageChars,
} from "../mode";
import { loadDemoDocumentsStore, loadDemoJobProfile, resetDemoCache } from "../store";
import { resolveChatIncludeLegacy } from "../../knowledge/visibility";
import { fillJobFormFields } from "../../job/fill-assist";

describe("public demo mode", () => {
  beforeEach(() => {
    resetDemoCache();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    resetDemoCache();
    vi.unstubAllEnvs();
  });

  it("is off by default so local mode is unchanged", () => {
    expect(isPublicDemoMode()).toBe(false);
  });

  it("loads anonymous demo profile and never requires .data", () => {
    vi.stubEnv("PUBLIC_DEMO_MODE", "true");
    const profile = readJobProfile();
    expect(profile.name).toBe("张三");
    expect(profile.education[0]?.school).toBe("示例大学");
    expect(profile.email).toBe("example@example.com");

    const fromFile = loadDemoJobProfile();
    expect(fromFile.name).toBe(profile.name);

    const dataProfile = path.join(process.cwd(), ".data", "profile", "job-profile.json");
    // Even if a local private profile file exists, demo mode must use demo/.
    if (fs.existsSync(dataProfile)) {
      const privateRaw = fs.readFileSync(dataProfile, "utf8");
      expect(privateRaw).not.toBe(JSON.stringify(profile, null, 2));
    }
    expect(readJobProfile().name).toBe("张三");
  });

  it("reads demo documents store instead of .data", () => {
    vi.stubEnv("PUBLIC_DEMO_MODE", "true");
    const store = readDocumentsStore();
    expect(store.documents.length).toBeGreaterThan(0);
    expect(store.chunks.some((chunk) => chunk.content.includes("示例大学"))).toBe(true);
    expect(listStoredDocuments("job").every((doc) => doc.document_id.startsWith("demo-"))).toBe(
      true,
    );

    const demoStore = loadDemoDocumentsStore();
    expect(demoStore.chunks.map((c) => c.evidence_id)).toEqual(
      store.chunks.map((c) => c.evidence_id),
    );
  });

  it("blocks upload, delete, and job profile writes", async () => {
    vi.stubEnv("PUBLIC_DEMO_MODE", "true");
    await expect(
      importDocumentFile({
        filename: "x.txt",
        buffer: Buffer.from("hello"),
        knowledgeSpace: "job",
      }),
    ).rejects.toBeInstanceOf(DemoModeWriteError);

    expect(() => deleteStoredDocument("demo-doc-basics")).toThrow(DemoModeWriteError);
    expect(() => writeJobProfile(readJobProfile())).toThrow(DemoModeWriteError);
  });

  it("exposes demo evidence to knowledge search corpus", async () => {
    vi.stubEnv("PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("CONTENT_AUDIENCE", "public");
    const { runWithIncludeLegacy } = await import("../../knowledge/visibility");
    await runWithIncludeLegacy(false, () => {
      const { chunks, includeLegacy } = loadKnowledgeBase("job");
      expect(includeLegacy).toBe(false);
      expect(chunks.some((chunk) => chunk.text.includes("示例大学"))).toBe(true);
      expect(chunks.some((chunk) => chunk.sourceType === "structured")).toBe(true);
      expect(chunks.some((chunk) => chunk.id.includes("demo-doc"))).toBe(true);
      expect(listDocumentChunks("job").length).toBeGreaterThan(0);
    });
  });

  it("supports job fill from demo profile", () => {
    vi.stubEnv("PUBLIC_DEMO_MODE", "true");
    const fields = fillJobFormFields({
      profile: readJobProfile(),
      fieldsText: "姓名：\n学校：\n公司：\n",
    });
    const byField = Object.fromEntries(fields.map((item) => [item.field, item.value]));
    expect(byField["姓名"]).toBe("张三");
    expect(byField["学校"]).toBe("示例大学");
    expect(byField["公司"]).toContain("云桥智能");
  });

  it("keeps production chat legacy/debug gates", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(resolveChatIncludeLegacy(true, true)).toBe(false);
  });

  it("caps agent message length and forces debug off in demo mode", () => {
    vi.stubEnv("PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NODE_ENV", "development");
    expect(maxAgentMessageChars()).toBe(4000);
    expect(allowAgentDebug(true)).toBe(false);
    expect(allowAgentDebug(false)).toBe(false);
  });

  it("keeps local agent limits when demo mode is off", () => {
    expect(isPublicDemoMode()).toBe(false);
    expect(maxAgentMessageChars()).toBe(8000);
    vi.stubEnv("NODE_ENV", "development");
    expect(allowAgentDebug(true)).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(allowAgentDebug(true)).toBe(false);
  });

  it("local mode still reads writable path helpers when demo is off", () => {
    expect(isPublicDemoMode()).toBe(false);
    // Should not throw; may be empty on fresh machines.
    expect(() => readDocumentsStore()).not.toThrow();
    expect(() => readJobProfile()).not.toThrow();
  });
});
