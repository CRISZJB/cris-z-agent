import { describe, expect, it } from "vitest";
import type { Source } from "@/lib/agent/types";
import { fragmentLabel, groupSourcesForDisplay } from "../groupSources";

function source(partial: Partial<Source> & Pick<Source, "id" | "title">): Source {
  return {
    path: partial.path ?? "",
    ...partial,
  };
}

describe("groupSourcesForDisplay", () => {
  it("groups uploaded chunks by document_id and keeps every evidence item", () => {
    const sources = [
      source({
        id: "doc-1:chunk-001",
        title: "简历.pdf",
        sourceName: "张三的简历.pdf",
        documentId: "doc-1",
        knowledgeSpace: "job",
        section: "片段001",
      }),
      source({
        id: "doc-1:chunk-002",
        title: "简历.pdf",
        sourceName: "张三的简历.pdf",
        documentId: "doc-1",
        knowledgeSpace: "job",
        section: "片段002",
      }),
      source({
        id: "doc-1:chunk-005",
        title: "简历.pdf",
        sourceName: "张三的简历.pdf",
        documentId: "doc-1",
        knowledgeSpace: "job",
        section: "片段005",
      }),
    ];

    const groups = groupSourcesForDisplay(sources);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.title).toBe("张三的简历.pdf");
    expect(groups[0]?.unitLabel).toBe("片段");
    expect(groups[0]?.items.map((item) => item.id)).toEqual([
      "doc-1:chunk-001",
      "doc-1:chunk-002",
      "doc-1:chunk-005",
    ]);
  });

  it("groups legacy profile sections by source name without merging ids", () => {
    const sources = [
      source({
        id: "profile:intro",
        title: "个人资料",
        sourceName: "个人资料",
        knowledgeSpace: "job",
        section: "个人介绍",
        sourceType: "legacy",
        path: "content/profile.md",
      }),
      source({
        id: "profile:direction",
        title: "个人资料",
        sourceName: "个人资料",
        knowledgeSpace: "job",
        section: "职业方向",
        sourceType: "legacy",
        path: "content/profile.md",
      }),
      source({
        id: "profile:capability",
        title: "个人资料",
        sourceName: "个人资料",
        knowledgeSpace: "job",
        section: "产品能力",
        sourceType: "legacy",
        path: "content/profile.md",
      }),
    ];

    const groups = groupSourcesForDisplay(sources);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.title).toBe("个人资料");
    expect(groups[0]?.unitLabel).toBe("章节");
    expect(groups[0]?.items).toHaveLength(3);
    expect(groups[0]?.items.map((item) => item.id)).toEqual([
      "profile:intro",
      "profile:direction",
      "profile:capability",
    ]);
    expect(fragmentLabel(sources[0]!, 0)).toBe("个人介绍");
  });

  it("keeps different documents as separate source groups", () => {
    const sources = [
      source({
        id: "doc-a:chunk-001",
        title: "a.pdf",
        sourceName: "a.pdf",
        documentId: "doc-a",
        section: "片段001",
      }),
      source({
        id: "doc-b:chunk-001",
        title: "b.pdf",
        sourceName: "b.pdf",
        documentId: "doc-b",
        section: "片段001",
      }),
    ];

    const groups = groupSourcesForDisplay(sources);
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.title)).toEqual(["a.pdf", "b.pdf"]);
  });
});
