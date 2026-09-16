import { preparePublicEvalEnv } from "./eval-env";
import { runAgent } from "../lib/agent/agent";
import { createChatCompletion } from "../lib/agent/deepseek";
import { TOOL_DEFINITIONS } from "../lib/agent/tools";
import { getContentAudience } from "../lib/knowledge/visibility";
import { listProjects } from "../lib/knowledge";

preparePublicEvalEnv();

function line(label: string, value: string) {
  console.log(`${label}: ${value}`);
}

async function main() {
  line("知识库范围", getContentAudience());
  if (getContentAudience() !== "public") {
    throw new Error("评测脚本未能锁定 CONTENT_AUDIENCE=public。");
  }

  const published = listProjects();
  line(
    "published 项目",
    published.map((project) => `${project.id} / ${project.title}`).join("；") || "（无）",
  );

  try {
    const probe = await createChatCompletion({
      messages: [
        {
          role: "system",
          content: "你是联调探针。请调用 list_projects 列出可见项目。",
        },
        { role: "user", content: "请调用 list_projects。" },
      ],
      tools: TOOL_DEFINITIONS,
    });

    line("DeepSeek 是否成功连接", "是");
    const toolCalls = probe.tool_calls ?? [];
    line("模型是否产生 tool_calls", toolCalls.length > 0 ? "是" : "否");
    if (toolCalls.length === 0) {
      throw new Error("DeepSeek 没有返回 tool_calls。请检查模型是否支持 function calling。");
    }
    line("调用了什么工具", toolCalls.map((call) => call.function.name).join(", "));
    for (const call of toolCalls) {
      line(`工具参数 · ${call.function.name}`, call.function.arguments);
    }
  } catch (error) {
    line("DeepSeek 是否成功连接", "否");
    throw error;
  }

  const listed = await runAgent([{ role: "user", content: "你目前最有代表性的项目是什么？" }], {
    debug: true,
  });
  const traces = listed.debug?.toolCalls ?? [];
  line("调用了什么工具", traces.map((call) => call.name).join(" -> ") || "（无）");
  for (const call of traces) {
    line(`工具参数 · ${call.name}`, JSON.stringify(call.input));
  }
  line("得到哪些 evidence_id", listed.debug?.retrievedEvidenceIds.join(", ") || "（无）");
  line("最终引用哪些 evidence_id", listed.debug?.citedEvidenceIds.join(", ") || "（无）");
  line(
    "是否存在无效引用",
    (listed.debug?.invalidCitationIds.length ?? 0) > 0
      ? `是（${listed.debug?.invalidCitationIds.join(", ")}）`
      : "否",
  );
  line("最终回答是否残留 <evidence> 标签", listed.answer.includes("<evidence>") ? "是" : "否");
  console.log("代表性项目 · 最终回答:");
  console.log(listed.answer);

  const missing = await runAgent([{ role: "user", content: "你以前在 Google 工作过吗？" }], {
    debug: true,
  });
  line("Google 幻觉题最终结果", missing.answer.replaceAll("\n", " / "));
  line("Google 题是否残留 <evidence> 标签", missing.answer.includes("<evidence>") ? "是" : "否");
  line("Google 题最终引用", missing.debug?.citedEvidenceIds.join(", ") || "（无）");
  line("Google 题无效引用", missing.debug?.invalidCitationIds.join(", ") || "（无）");
  line("Google 题事实保护", JSON.stringify(missing.debug?.factGuard));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message.replace(/sk-[a-zA-Z0-9]+/g, "[redacted]"));
  process.exit(1);
});
