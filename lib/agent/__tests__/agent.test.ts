import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgent } from "../agent";
import type { CreateChatCompletionInput, DeepSeekChoiceMessage } from "../types";

describe("runAgent", () => {
  beforeEach(() => {
    vi.stubEnv("RETRIEVAL_MODE", "bm25");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lets the model call tools then answer from tool results", async () => {
    const calls: CreateChatCompletionInput[] = [];
    const complete = async (input: CreateChatCompletionInput): Promise<DeepSeekChoiceMessage> => {
      calls.push(input);
      if (calls.length === 1) {
        return {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: {
                name: "search_knowledge",
                arguments: JSON.stringify({ query: "人工智能 项目" }),
              },
            },
          ],
        };
      }
      const toolMessage = input.messages.find((message) => message.role === "tool");
      expect(toolMessage?.content).toContain("evidence_id");
      const parsed = JSON.parse(toolMessage?.content ?? "{}") as {
        results: Array<{ evidence_id: string }>;
      };
      const evidenceId = parsed.results[0]?.evidence_id;
      expect(evidenceId).toBeTruthy();
      return {
        role: "assistant",
        content: `根据演示项目资料，目前最完整的人工智能相关案例是作品集智能体本身。这是演示内容。

<evidence>
${evidenceId}
invented:should-be-dropped
</evidence>`,
      };
    };

    const response = await runAgent([{ role: "user", content: "你最有代表性的人工智能项目是什么？" }], {
      debug: true,
      dependencies: { complete },
    });

    expect(calls).toHaveLength(2);
    expect(response.answer).toContain("演示");
    expect(response.answer).not.toContain("<evidence>");
    expect(response.sources).toHaveLength(1);
    expect(response.sources[0]?.id).toMatch(/:/);
    expect(response.debug?.citedEvidenceIds).toHaveLength(1);
    expect(response.debug?.invalidCitationIds).toEqual(["invented:should-be-dropped"]);
    expect(response.debug?.toolCalls[0]?.name).toBe("search_knowledge");
    expect(response.debug?.reachedMaxIterations).toBe(false);
  });

  it("stops at the iteration cap instead of looping forever", async () => {
    const complete = async (): Promise<DeepSeekChoiceMessage> => ({
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_loop",
          type: "function",
          function: {
            name: "list_projects",
            arguments: "{}",
          },
        },
      ],
    });

    const response = await runAgent([{ role: "user", content: "列出所有项目" }], {
      debug: true,
      dependencies: { complete },
    });

    expect(response.debug?.reachedMaxIterations).toBe(true);
    expect(response.debug?.iterations).toBe(5);
    expect(response.answer).toContain("上限");
  });

  it("retries then blocks a biography claim that has no valid evidence", async () => {
    const complete = async (): Promise<DeepSeekChoiceMessage> => ({
      role: "assistant",
      content: "是的，我之前在 Google 工作过。",
    });

    const response = await runAgent([{ role: "user", content: "你以前在 Google 工作过吗？" }], {
      debug: true,
      dependencies: { complete },
    });

    expect(response.answer).toBe(
      "目前我的资料里没有证据支持这个结论，因此我无法确认或否认。",
    );
    expect(response.answer.trim().startsWith("没有")).toBe(false);
    expect(response.sources).toEqual([]);
    expect(response.debug?.factGuard.retried).toBe(true);
    expect(response.debug?.factGuard.blockedUncitedBiography).toBe(true);
    expect(response.debug?.modelCalls).toBeGreaterThanOrEqual(2);
  });

  it("allows greetings without citations", async () => {
    const complete = async (): Promise<DeepSeekChoiceMessage> => ({
      role: "assistant",
      content: "你好，我是基于作品集资料回答的智能体。",
    });

    const response = await runAgent([{ role: "user", content: "你好" }], {
      debug: true,
      dependencies: { complete },
    });

    expect(response.answer).toContain("智能体");
    expect(response.debug?.factGuard.blockedUncitedBiography).toBe(false);
    expect(response.debug?.modelCalls).toBe(1);
  });

  it("does not let a Google question start with 没有 even after a tool call", async () => {
    const complete = async (
      input: CreateChatCompletionInput,
    ): Promise<DeepSeekChoiceMessage> => {
      const hasToolResult = input.messages.some((message) => message.role === "tool");
      if (!hasToolResult) {
        return {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_exp",
              type: "function",
              function: {
                name: "search_knowledge",
                arguments: JSON.stringify({ query: "Google 工作经历" }),
              },
            },
          ],
        };
      }
      const toolMessage = input.messages.find((message) => message.role === "tool");
      const parsed = JSON.parse(toolMessage?.content ?? "{}") as {
        results: Array<{ evidence_id: string }>;
      };
      return {
        role: "assistant",
        content: `没有。我的作品集里目前没有收录任何公司任职记录。

<evidence>
${parsed.results[0]?.evidence_id}
</evidence>`,
      };
    };

    const response = await runAgent([{ role: "user", content: "你有没有在 Google 工作过？" }], {
      debug: true,
      dependencies: { complete },
    });

    expect(response.answer.trim().startsWith("没有")).toBe(false);
    expect(response.answer).toContain("无法确认或否认");
  });

  it("replaces affiliation speculation with the safe unknown-affiliation answer", async () => {
    const complete = async (): Promise<DeepSeekChoiceMessage> => ({
      role: "assistant",
      content: "可能属于亿次网联。",
    });

    const response = await runAgent(
      [{ role: "user", content: "国信智会 / 国信密盒属于哪段经历？" }],
      { debug: true, dependencies: { complete } },
    );

    expect(response.answer).toContain("国信智会 / 国信密盒");
    expect(response.answer).toContain("无法可靠确认它属于哪一段公司经历");
    expect(response.answer).not.toContain("可能属于");
    expect(response.answer).not.toContain("亿次网联");
  });

  it("keeps a redo follow-up on project-1 retro instead of answering the fact-guard rules", async () => {
    vi.stubEnv("CONTENT_AUDIENCE", "public");
    const complete = async (
      input: CreateChatCompletionInput,
    ): Promise<DeepSeekChoiceMessage> => {
      const leakedGuard = input.messages.some((message) =>
        (message.content ?? "").includes("缺少证据不等于否定事实"),
      );
      expect(leakedGuard).toBe(false);
      const inherited = input.messages.some((message) =>
        (message.content ?? "").includes("project-1") &&
        (message.content ?? "").includes("省略主语"),
      );
      expect(inherited).toBe(true);

      const hasToolResult = input.messages.some((message) => message.role === "tool");
      if (!hasToolResult) {
        return {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_project",
              type: "function",
              function: {
                name: "get_project",
                arguments: JSON.stringify({ project_id: "project-1" }),
              },
            },
          ],
        };
      }

      return {
        role: "assistant",
        content: `如果重新做一次，我会更早写入真实任职与项目，而不是先用演示数据把提示词调熟。

<evidence>
project-1:retro
project-1:tradeoffs
</evidence>`,
      };
    };

    const response = await runAgent(
      [
        { role: "user", content: "介绍一下人工智能作品集智能体。" },
        { role: "assistant", content: "这是我的人工智能作品集智能体项目。" },
        { role: "user", content: "这里面最难的决策是什么？" },
        { role: "assistant", content: "最难的是同时把决策权交给模型又不允许编造经历。" },
        { role: "user", content: "如果重新做一次，你会改什么？" },
      ],
      { debug: true, dependencies: { complete } },
    );

    expect(response.answer).toContain("更早写入真实任职");
    expect(response.answer).not.toContain("事实必须有证据");
    expect(response.sources.some((source) => source.id === "project-1:retro")).toBe(true);
    expect(response.debug?.factGuard.retried).toBe(false);
  });
});
