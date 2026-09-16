import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT } from "../prompts";
import { TOOL_DEFINITIONS } from "../tools";

describe("public runtime text", () => {
  it("does not mention demo-portfolio-agent in the system prompt or tool schemas", () => {
    expect(SYSTEM_PROMPT).not.toContain("demo-portfolio-agent");
    const toolText = JSON.stringify(TOOL_DEFINITIONS);
    expect(toolText).not.toContain("demo-portfolio-agent");
  });

  it("encourages minimum tool use for grounded generation", () => {
    expect(SYSTEM_PROMPT).toContain("minimum set of tools");
    expect(SYSTEM_PROMPT).toContain("优先只调用 search_knowledge");
    expect(SYSTEM_PROMPT).toContain("list_knowledge_spaces");
    const search = TOOL_DEFINITIONS.find((tool) => tool.function.name === "search_knowledge");
    expect(search?.function.description).toMatch(/优先/);
    const spaces = TOOL_DEFINITIONS.find((tool) => tool.function.name === "list_knowledge_spaces");
    expect(spaces?.function.description).toMatch(/不要先调/);
  });

  it("defaults to delivering the user task without process commentary", () => {
    expect(SYSTEM_PROMPT).toContain("默认直接交付用户要的成品");
    expect(SYSTEM_PROMPT).toContain("不要附带「几点说明 / 事实部分 / AI 生成部分 / 哪些来自简历」");
    expect(SYSTEM_PROMPT).toContain("何时才主动解释边界");
    expect(SYSTEM_PROMPT).toContain("避免空泛自我评价");
    expect(SYSTEM_PROMPT).not.toMatch(/回答时明确区分，例如：\s*【基于你的资料】/);
  });

  it("forbids inferring company affiliation from position when affiliation_unknown", () => {
    expect(SYSTEM_PROMPT).toContain("affiliation_unknown");
    expect(SYSTEM_PROMPT).toContain("不得根据文本位置、chunk 顺序、相邻 Evidence");
    expect(SYSTEM_PROMPT).toContain("无法可靠确认它属于哪一段公司经历");
    expect(SYSTEM_PROMPT).toContain("可能属于");
  });
});
