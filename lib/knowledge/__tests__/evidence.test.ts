import { describe, expect, it } from "vitest";
import { evidenceIdFor, slugifySection } from "../evidence";
import { loadProject, search } from "../index";

describe("evidence ids", () => {
  it("maps standard section headings to stable keys", () => {
    expect(slugifySection("产品决策")).toBe("product-decision");
    expect(slugifySection("上线结果")).toBe("results");
    expect(slugifySection("最终方案")).toBe("solution");
    expect(evidenceIdFor("project-1", "我的职责")).toBe("project-1:role");
  });

  it("builds reproducible ids from document key and section", () => {
    expect(evidenceIdFor("demo-portfolio-agent", "产品决策")).toBe(
      "demo-portfolio-agent:product-decision",
    );
    expect(evidenceIdFor("profile", "个人介绍")).toBe("profile:intro");
  });

  it("attaches the same id to loaded project sections and search hits", () => {
    const document = loadProject("demo-portfolio-agent");
    const decision = document?.sections.find((section) => section.heading === "产品决策");
    expect(decision?.evidenceId).toBe("demo-portfolio-agent:product-decision");

    const hits = search("产品决策 智能体");
    expect(hits.some((hit) => hit.evidenceId === "demo-portfolio-agent:product-decision")).toBe(
      true,
    );
  });
});
