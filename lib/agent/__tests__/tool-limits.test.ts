import { describe, expect, it } from "vitest";
import { truncateForModel, SEARCH_RESULT_CONTENT_MAX_CHARS } from "../tool-limits";

describe("tool-limits", () => {
  it("does not truncate short text", () => {
    const { text, truncated } = truncateForModel("短文本", 100);
    expect(truncated).toBe(false);
    expect(text).toBe("短文本");
  });

  it("truncates long text near a sentence boundary when possible", () => {
    const body = `${"甲".repeat(40)}。${"乙".repeat(900)}`;
    const { text, truncated } = truncateForModel(body, SEARCH_RESULT_CONTENT_MAX_CHARS);
    expect(truncated).toBe(true);
    expect(text.endsWith("…")).toBe(true);
    expect(text.length).toBeLessThanOrEqual(SEARCH_RESULT_CONTENT_MAX_CHARS);
  });
});
