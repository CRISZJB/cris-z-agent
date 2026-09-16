import { describe, expect, it } from "vitest";
import { PLACEHOLDER_PATTERNS, findPlaceholders, validateContent } from "../validate";

describe("content validation", () => {
  it("detects existing placeholder markers", () => {
    const text = "正文 [演示内容] 以及 [需要用户补充：结果]";
    const hits = findPlaceholders(text, "content/projects/demo.md");
    expect(hits.map((hit) => hit.marker)).toEqual(
      expect.arrayContaining(["[演示内容]", "[需要用户补充"]),
    );
    expect(PLACEHOLDER_PATTERNS.length).toBeGreaterThan(0);
  });

  it("allows demo files with placeholders in the current repo", () => {
    const report = validateContent();
    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it("rejects published documents that still contain placeholders", () => {
    const report = validateContent({
      documents: [
        {
          path: "content/projects/fake.md",
          kind: "project",
          status: "published",
          id: "real-project",
          slug: "real-project",
          title: "真实项目",
          body: "[占位内容] 还没写完",
          required: { id: true, title: true, status: true, slug: true },
        },
      ],
    });
    expect(report.ok).toBe(false);
    expect(report.errors.join("\n")).toMatch(/published/);
    expect(report.errors.join("\n")).toMatch(/占位内容/);
  });

  it("rejects duplicate project ids", () => {
    const report = validateContent({
      documents: [
        {
          path: "content/projects/a.md",
          kind: "project",
          status: "demo",
          id: "same-id",
          slug: "a",
          title: "A",
          body: "ok",
          required: { id: true, title: true, status: true, slug: true },
        },
        {
          path: "content/projects/b.md",
          kind: "project",
          status: "demo",
          id: "same-id",
          slug: "b",
          title: "B",
          body: "ok",
          required: { id: true, title: true, status: true, slug: true },
        },
      ],
    });
    expect(report.ok).toBe(false);
    expect(report.errors.join("\n")).toMatch(/重复/);
  });
});
