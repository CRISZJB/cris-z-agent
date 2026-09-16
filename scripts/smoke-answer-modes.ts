import { runAgent } from "../lib/agent/agent";
import { runWithChatKnowledgeContext } from "../lib/knowledge/visibility";
import { preparePublicEvalEnv } from "./eval-env";

preparePublicEvalEnv();

const CASES = [
  { id: "1-general-rag", q: "什么是 RAG？" },
  { id: "2-kb-rag", q: "我的资料里有没有提到 RAG？" },
  { id: "3-grounded-intro", q: "根据我的资料帮我写一段 AI 产品经理自我介绍。" },
  { id: "4-rewrite", q: "帮我优化这句话：我是应届生，想做 AI 产品经理。" },
  { id: "5-gap", q: "结合我的经历，你觉得我还缺什么能力？" },
  { id: "6-google", q: "我在 Google 工作过吗？" },
  { id: "7-tiktok", q: "详细介绍一下你负责 TikTok 推荐算法的项目。" },
];

async function main() {
  for (const item of CASES) {
    const result = await runWithChatKnowledgeContext(
      { audience: "public", includeLegacy: false },
      () => runAgent([{ role: "user", content: item.q }], { debug: true }),
    );
    const tools = (result.debug?.toolCalls ?? []).map((t) => t.name);
    console.log("\n" + "=".repeat(72));
    console.log(`[${item.id}] ${item.q}`);
    console.log(`tools: ${tools.join(" -> ") || "（无）"}`);
    console.log(`sources: ${result.sources.map((s) => s.id).join(", ") || "（无）"}`);
    console.log(
      `factGuard: retried=${result.debug?.factGuard.retried} blocked=${result.debug?.factGuard.blockedUncitedBiography}`,
    );
    console.log(`answer:\n${result.answer.slice(0, 600)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
