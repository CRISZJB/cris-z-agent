import { describe, expect, it } from "vitest";
import { parseCitedEvidence, stripEvidenceBlock } from "../citations";

describe("cited evidence parsing", () => {
  it("reads a trailing evidence block and strips it from the answer", () => {
    const raw = `我在这个项目中选择了智能体，而不是固定搜索。

<evidence>
demo-portfolio-agent:product-decision
demo-portfolio-agent:tradeoffs
</evidence>`;

    expect(parseCitedEvidence(raw)).toEqual([
      "demo-portfolio-agent:product-decision",
      "demo-portfolio-agent:tradeoffs",
    ]);
    expect(stripEvidenceBlock(raw)).toBe("我在这个项目中选择了智能体，而不是固定搜索。");
    expect(stripEvidenceBlock(raw)).not.toContain("<evidence>");
  });

  it("ignores ids that were not retrieved in this turn", () => {
    const raw = `<evidence>
demo-portfolio-agent:product-decision
invented:hallucination
</evidence>`;
    const cited = parseCitedEvidence(raw);
    const retrieved = new Set(["demo-portfolio-agent:product-decision"]);
    const allowed = cited.filter((id) => retrieved.has(id));
    expect(allowed).toEqual(["demo-portfolio-agent:product-decision"]);
  });
});
