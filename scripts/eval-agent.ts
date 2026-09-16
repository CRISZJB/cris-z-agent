import { readFile } from "node:fs/promises";
import path from "node:path";
import { runAgent } from "../lib/agent/agent";

type EvalQuestion = {
  id: string;
  type: string;
  question: string;
  expect: string;
  setup?: string[];
};

async function main() {
  const file = path.join(process.cwd(), "evals", "questions.json");
  const payload = JSON.parse(await readFile(file, "utf8")) as { questions: EvalQuestion[] };

  console.log("作品集智能体评估（手动检查答案，不自动打分）\n");

  for (const item of payload.questions) {
    const messages = [
      ...(item.setup ?? []).map((content) => ({ role: "user" as const, content })),
      { role: "user" as const, content: item.question },
    ];

    console.log(`## ${item.id} · ${item.type}`);
    console.log(`Q: ${item.question}`);
    console.log(`期望: ${item.expect}`);

    const result = await runAgent(messages, { debug: true });
    console.log(`A: ${result.answer}`);
    console.log(
      `来源: ${result.sources.map((source) => source.path).join(" | ") || "（无）"}`,
    );
    console.log(
      `工具: ${(result.debug?.toolCalls ?? []).map((call) => call.name).join(" -> ") || "（无）"}`,
    );
    console.log("");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
