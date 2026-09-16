import { DeepSeekApiError } from "../lib/agent/deepseek";
import { runAgent } from "../lib/agent/agent";
import type { AgentDebug, AgentPerf } from "../lib/agent/types";
import { runWithChatKnowledgeContext } from "../lib/knowledge/visibility";
import { preparePublicEvalEnv } from "./eval-env";

preparePublicEvalEnv();

const CASES = [
  { id: "A", q: "什么是 RAG？" },
  { id: "B", q: "我的资料里有哪些关于 AI 产品经理的信息？" },
  { id: "C", q: "根据我的资料，帮我写一段 150 字左右的 AI 产品经理自我介绍。" },
  { id: "D", q: "根据我的资料，帮我写一段 500 字左右的 AI 产品经理自我介绍。" },
] as const;

const REPEAT = ["C", "D"] as const;
const REPEAT_TIMES = 3;

type CaseResult = {
  id: string;
  q: string;
  ok: boolean;
  timedOut: boolean;
  error?: string;
  answerPreview?: string;
  debug?: AgentDebug;
  perf?: AgentPerf;
};

function formatMs(ms: number) {
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatChars(n: number) {
  return `${n} (${(n / 1024).toFixed(1)} KB)`;
}

async function runCase(id: string, q: string): Promise<CaseResult> {
  try {
    const result = await runWithChatKnowledgeContext(
      { audience: "public", includeLegacy: false },
      () => runAgent([{ role: "user", content: q }], { debug: true }),
    );
    return {
      id,
      q,
      ok: true,
      timedOut: Boolean(result.debug?.perf?.timedOut),
      answerPreview: result.answer.slice(0, 200),
      debug: result.debug,
      perf: result.debug?.perf,
    };
  } catch (error) {
    const ds = error instanceof DeepSeekApiError ? error : null;
    const debug = ds?.agentDebug;
    const message = error instanceof Error ? error.message : String(error);
    return {
      id,
      q,
      ok: false,
      timedOut: Boolean(ds?.timedOut || debug?.perf?.timedOut || /超时/.test(message)),
      error: message.replace(/sk-[a-zA-Z0-9]+/g, "[redacted]"),
      debug,
      perf: debug?.perf,
    };
  }
}

function printCase(result: CaseResult) {
  console.log("\n" + "=".repeat(72));
  console.log(`[${result.id}] ${result.q}`);
  console.log(`result: ${result.ok ? "ok" : "FAILED"}${result.timedOut ? " · TIMEOUT" : ""}`);
  if (result.error) {
    console.log(`error: ${result.error}`);
  }

  const debug = result.debug;
  const perf = result.perf;
  console.log(`iterations: ${debug?.iterations ?? "n/a"}`);
  console.log(`modelCalls: ${debug?.modelCalls ?? "n/a"}`);
  console.log(
    `tools: ${(debug?.toolCalls ?? []).map((t) => t.name).join(" -> ") || "（无）"}`,
  );
  console.log(`total: ${perf ? formatMs(perf.totalMs) : "n/a"}`);
  console.log(`requestId: ${perf?.requestId ?? "n/a"}`);

  if (perf) {
    console.log("\n--- model calls ---");
    for (const call of perf.modelCalls) {
      console.log(
        [
          `Call ${call.modelCallIndex + 1}:`,
          formatMs(call.durationMs),
          `msgs=${call.inputMessageCount}`,
          `inputChars=${formatChars(call.inputCharCount)}`,
          `toolResultChars=${formatChars(call.toolResultCharCount)}`,
          call.timedOut
            ? "TIMEOUT"
            : call.hasToolCalls
              ? `tool_calls=[${call.toolCallNames.join(",")}]`
              : `finish=${call.finishReason ?? "null"}`,
        ].join(" "),
      );
    }

    console.log("\n--- tools ---");
    if (perf.toolCalls.length === 0) {
      console.log("(none)");
    }
    for (const tool of perf.toolCalls) {
      console.log(
        [
          tool.toolName,
          formatMs(tool.durationMs),
          `in=${tool.inputChars}c`,
          `out=${formatChars(tool.outputChars)}`,
          `args={${tool.argsSummary}}`,
        ].join(" · "),
      );
    }
  }

  if (result.answerPreview) {
    console.log(`\nanswer preview:\n${result.answerPreview}`);
  }
}

function printSummaryTable(results: CaseResult[]) {
  console.log("\n" + "#".repeat(72));
  console.log("SUMMARY");
  console.log(
    ["id", "modelCalls", "tools", "finalInputChars", "finalModelMs", "totalMs", "result"].join(
      " | ",
    ),
  );
  for (const result of results) {
    const tools = (result.debug?.toolCalls ?? []).map((t) => t.name).join(">") || "-";
    const finalCall = result.perf?.modelCalls[result.perf.modelCalls.length - 1];
    const status = result.timedOut ? "TIMEOUT" : result.ok ? "ok" : "error";
    console.log(
      [
        result.id,
        String(result.debug?.modelCalls ?? "-"),
        tools,
        finalCall ? String(finalCall.inputCharCount) : "-",
        finalCall ? String(finalCall.durationMs) : "-",
        result.perf ? String(result.perf.totalMs) : "-",
        status,
      ].join(" | "),
    );
  }
}

async function main() {
  console.log("diagnose:timeout — public audience, debug perf enabled");
  console.log(`CONTENT_AUDIENCE=${process.env.CONTENT_AUDIENCE}`);

  const results: CaseResult[] = [];
  for (const item of CASES) {
    const result = await runCase(item.id, item.q);
    results.push(result);
    printCase(result);
  }

  console.log("\n" + "#".repeat(72));
  console.log(`REPEAT C/D × ${REPEAT_TIMES}`);
  for (const id of REPEAT) {
    const base = CASES.find((item) => item.id === id);
    if (!base) {
      continue;
    }
    for (let i = 1; i <= REPEAT_TIMES; i += 1) {
      const result = await runCase(`${id}-r${i}`, base.q);
      results.push(result);
      printCase(result);
    }
  }

  printSummaryTable(results);

  const failedHard = results.filter((r) => !r.ok && !r.timedOut);
  if (failedHard.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message.replace(/sk-[a-zA-Z0-9]+/g, "[redacted]"));
  process.exit(1);
});
