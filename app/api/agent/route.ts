import { z } from "zod";
import { AgentConfigError } from "@/lib/agent/config";
import { runAgent } from "@/lib/agent/agent";
import { DeepSeekApiError } from "@/lib/agent/deepseek";
import { allowAgentDebug, maxAgentMessageChars } from "@/lib/demo/mode";
import { ContentSafetyError } from "@/lib/knowledge/loader";
import { parseKnowledgeScope } from "@/lib/knowledge/spaces";
import {
  resolveChatContentAudience,
  resolveChatIncludeLegacy,
  runWithChatKnowledgeContext,
} from "@/lib/knowledge/visibility";

export const runtime = "nodejs";
export const maxDuration = 60;

function agentRequestSchema() {
  const maxChars = maxAgentMessageChars();
  return z.object({
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().min(1).max(maxChars),
        }),
      )
      .min(1)
      .max(30),
    debug: z.boolean().optional(),
    knowledge_space: z.string().optional(),
    include_demo: z.boolean().optional(),
    include_legacy: z.boolean().optional(),
  });
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = agentRequestSchema().safeParse(json);
    if (!parsed.success) {
      return Response.json(
        { error: "请求格式无效。需要 messages: [{ role, content }]。" },
        { status: 400 },
      );
    }

    const allowDebug = allowAgentDebug(parsed.data.debug);
    const knowledgeScope = parseKnowledgeScope(parsed.data.knowledge_space);
    const audience = resolveChatContentAudience(parsed.data.include_demo);
    const includeLegacy = resolveChatIncludeLegacy(
      parsed.data.include_legacy,
      parsed.data.include_demo,
    );
    const result = await runWithChatKnowledgeContext({ audience, includeLegacy }, () =>
      runAgent(parsed.data.messages, {
        debug: allowDebug,
        knowledgeScope,
      }),
    );
    return Response.json(result);
  } catch (error) {
    if (error instanceof AgentConfigError) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    if (error instanceof ContentSafetyError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof DeepSeekApiError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    return Response.json(
      {
        error:
          error instanceof Error
            ? `智能体运行失败：${error.message}`
            : "智能体运行失败。",
      },
      { status: 500 },
    );
  }
}
