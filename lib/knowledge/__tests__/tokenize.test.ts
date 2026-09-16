import { describe, expect, it } from "vitest";
import { tokenize } from "../tokenize";

describe("tokenize", () => {
  it("keeps latin words and chinese unigrams plus bigrams", () => {
    const tokens = tokenize("人工智能产品经理 DeepSeek");
    expect(tokens).toContain("deepseek");
    expect(tokens).toContain("人");
    expect(tokens).toContain("人工");
    expect(tokens).toContain("智能");
  });
});
