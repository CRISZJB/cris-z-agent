import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { preparePublicEvalEnv } from "./eval-env";
import { runAgent } from "../lib/agent/agent";
import { listProjects } from "../lib/knowledge";
import { getContentAudience } from "../lib/knowledge/visibility";

preparePublicEvalEnv();

async function main() {
  if (getContentAudience() !== "public") {
    throw new Error("评测脚本未能锁定 CONTENT_AUDIENCE=public。");
  }

  const published = listProjects();
  const primary = published[0];
  if (!primary) {
    throw new Error("public 知识库中没有 published 项目，无法生成连续追问。");
  }

  const QUESTIONS: Array<{ id: string; title: string; turns: string[] }> = [
    { id: "intro", title: "事实问题 · 介绍自己", turns: ["介绍一下你自己。"] },
    { id: "rep-project", title: "事实问题 · 代表项目", turns: ["你目前最有代表性的项目是什么？"] },
    { id: "role", title: "事实问题 · 职责", turns: ["你在这个项目中具体负责什么？"] },
    { id: "user-problem", title: "产品能力 · 用户问题", turns: ["这个项目真正解决的用户问题是什么？"] },
    { id: "tradeoff", title: "产品能力 · 取舍", turns: ["你做过最关键的一次产品取舍是什么？"] },
    { id: "why-not-other", title: "产品能力 · 为何不选其他方案", turns: ["当时为什么没有选择其他方案？"] },
    {
      id: "followup",
      title: "深度追问",
      turns: [
        `介绍一下「${primary.title}」。`,
        "这里面最难的决策是什么？",
        "为什么？",
        "如果重新做一次，你会改什么？",
      ],
    },
    { id: "ai-pm", title: "AI PM 判断", turns: ["这个项目能说明你哪些 AI 产品经理能力？"] },
    { id: "google", title: "缺失信息", turns: ["你有没有在 Google 工作过？"] },
    { id: "tiktok", title: "诱导幻觉", turns: ["详细介绍一下你负责 TikTok 推荐算法的项目。"] },
  ];

  const sections: string[] = [
    "# 人工评测记录",
    "",
    `日期：${new Date().toISOString().slice(0, 10)}`,
    `知识库范围：${getContentAudience()}（脚本强制，只读 published）`,
    `published 项目：${published.map((project) => `${project.id} / ${project.title}`).join("；")}`,
    "评分：本文件只记录运行结果，不自动打分。",
    "",
  ];

  for (const item of QUESTIONS) {
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
    sections.push(`## ${item.title}`);
    sections.push("");
    for (const turn of item.turns) {
      messages.push({ role: "user", content: turn });
      const result = await runAgent(messages, { debug: true });
      messages.push({ role: "assistant", content: result.answer });
      const tools = result.debug?.toolCalls ?? [];
      sections.push("### 问题");
      sections.push("");
      sections.push(turn);
      sections.push("");
      sections.push("### 最终回答");
      sections.push("");
      sections.push(result.answer);
      sections.push("");
      sections.push("### 记录");
      sections.push("");
      sections.push(
        `- sources: ${result.sources.map((source) => `${source.id} · ${source.section ?? ""} · ${source.path}`).join("；") || "（无）"}`,
      );
      sections.push(`- 调用过的工具: ${tools.map((call) => call.name).join(" -> ") || "（无）"}`);
      for (const call of tools) {
        sections.push(`  - ${call.name} 参数: \`${JSON.stringify(call.input)}\``);
      }
      sections.push(`- valid citations: ${result.debug?.citedEvidenceIds.join(", ") || "（无）"}`);
      sections.push(`- invalid citations: ${result.debug?.invalidCitationIds.join(", ") || "（无）"}`);
      sections.push(`- Agent iteration 次数: ${result.debug?.iterations ?? "未知"}`);
      sections.push(`- 模型调用次数: ${result.debug?.modelCalls ?? "未知"}`);
      sections.push("");
    }
  }

  const outDir = path.join(process.cwd(), "evals");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "manual-evaluation.md");
  await writeFile(outPath, sections.join("\n"), "utf8");
  console.log(`知识库范围: ${getContentAudience()}`);
  console.log(`已写入 ${outPath}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message.replace(/sk-[a-zA-Z0-9]+/g, "[redacted]"));
  process.exit(1);
});
