import { parseCitedEvidence, stripEvidenceBlock } from "./citations";
import { MAX_AGENT_ITERATIONS } from "./config";
import { createChatCompletion, DeepSeekApiError } from "./deepseek";
import {
  buildAffiliationUnknownAnswer,
  FACT_RETRY_NUDGE,
  INSUFFICIENT_EVIDENCE_ANSWER,
  isAffiliationUnknownEvidence,
  isSafeInsufficientAnswer,
  latestUserText,
  shouldApplyBiographyGuard,
  shouldBlockAffiliationGuess,
  startsWithUnsupportedNegation,
} from "./fact-guard";
import { createRequestId, measureMessageChars, safeJsonLength, summarizeToolArgs } from "./perf";
import { inheritProjectContext, projectContextHint } from "./project-context";
import { SYSTEM_PROMPT } from "./prompts";
import { setToolKnowledgeScope } from "./runtime-scope";
import { executeTool, TOOL_DEFINITIONS } from "./tools";
import type {
  AgentDebug,
  AgentPerf,
  AgentResponse,
  ChatMessage,
  ClientMessage,
  CreateChatCompletionInput,
  DeepSeekChoiceMessage,
  ModelCallPerf,
  Source,
  ToolCallPerf,
  ToolTrace,
} from "./types";
import type { KnowledgeScope } from "../knowledge/spaces";
import { knowledgeSpaceLabel } from "../knowledge/spaces";

export type AgentDependencies = {
  complete: (
    input: CreateChatCompletionInput,
  ) => Promise<DeepSeekChoiceMessage>;
};

export async function runAgent(
  messages: ClientMessage[],
  options?: {
    debug?: boolean;
    dependencies?: AgentDependencies;
    knowledgeScope?: KnowledgeScope;
  },
): Promise<AgentResponse> {
  const debugEnabled = Boolean(options?.debug);
  const injectedComplete = options?.dependencies?.complete;
  const knowledgeScope = options?.knowledgeScope ?? "all";
  setToolKnowledgeScope(knowledgeScope);
  const traces: ToolTrace[] = [];
  const errors: string[] = [];
  const retrieved = new Map<string, Source>();
  const clientMessages = sanitizeClientMessages(messages);
  const projectContext = inheritProjectContext(clientMessages);
  const scopeHint =
    knowledgeScope === "all"
      ? "当前知识范围：全部知识。"
      : `当前知识范围：${knowledgeSpaceLabel(knowledgeScope)}（${knowledgeScope}）。search_knowledge / list_documents 默认限定此空间。`;
  const conversation: ChatMessage[] = [
    {
      role: "system",
      content: [
        SYSTEM_PROMPT,
        `# 当前会话知识范围\n${scopeHint}`,
        projectContext ? `# 当前项目上下文\n${projectContextHint(projectContext)}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
    ...clientMessages,
  ];
  const requiresEvidence = shouldApplyBiographyGuard(messages);

  const requestId = createRequestId();
  const requestStartedAt = Date.now();
  const requestStartIso = new Date(requestStartedAt).toISOString();
  const modelPerf: ModelCallPerf[] = [];
  const toolPerf: ToolCallPerf[] = [];
  let timedOut = false;

  let reachedMaxIterations = false;
  let modelCalls = 0;
  let iterations = 0;
  let finalText = "";
  let citedIds: string[] = [];
  let invalidCitationIds: string[] = [];
  let retried = false;
  let blockedUncitedBiography = false;

  const buildDebug = (): AgentDebug => {
    const requestEndedAt = Date.now();
    const perf: AgentPerf | undefined = debugEnabled
      ? {
          requestId,
          requestStartIso,
          requestEndIso: new Date(requestEndedAt).toISOString(),
          totalMs: requestEndedAt - requestStartedAt,
          modelCalls: modelPerf,
          toolCalls: toolPerf,
          timedOut,
        }
      : undefined;

    return {
      iterations,
      modelCalls,
      reachedMaxIterations,
      toolCalls: traces,
      retrievedEvidenceIds: [...retrieved.keys()],
      citedEvidenceIds: citedIds,
      invalidCitationIds,
      factGuard: {
        retried,
        blockedUncitedBiography,
      },
      errors,
      ...(perf ? { perf } : {}),
    };
  };

  const complete = async (input: CreateChatCompletionInput): Promise<DeepSeekChoiceMessage> => {
    const callIndex = modelPerf.length;
    const startOffsetMs = Date.now() - requestStartedAt;

    if (injectedComplete) {
      const callStarted = Date.now();
      const message = await injectedComplete(input);
      if (debugEnabled) {
        const toolCalls = message.tool_calls ?? [];
        const { inputCharCount, toolResultCharCount } = measureMessageChars(input.messages);
        modelPerf.push({
          modelCallIndex: callIndex,
          startOffsetMs,
          endOffsetMs: Date.now() - requestStartedAt,
          durationMs: Date.now() - callStarted,
          inputMessageCount: input.messages.length,
          inputCharCount,
          toolResultCharCount,
          toolDefinitionCount: input.tools?.length ?? 0,
          finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
          hasToolCalls: toolCalls.length > 0,
          toolCallCount: toolCalls.length,
          toolCallNames: toolCalls.map((call) => call.function.name),
          timedOut: false,
        });
      }
      return message;
    }

    try {
      return await createChatCompletion(input, {
        onMeta: (meta) => {
          if (!debugEnabled) {
            return;
          }
          if (meta.timedOut) {
            timedOut = true;
          }
          modelPerf.push({
            modelCallIndex: callIndex,
            startOffsetMs,
            endOffsetMs: startOffsetMs + meta.durationMs,
            durationMs: meta.durationMs,
            inputMessageCount: meta.inputMessageCount,
            inputCharCount: meta.inputCharCount,
            toolResultCharCount: meta.toolResultCharCount,
            toolDefinitionCount: meta.toolDefinitionCount,
            finishReason: meta.finishReason,
            hasToolCalls: meta.hasToolCalls,
            toolCallCount: meta.toolCallCount,
            toolCallNames: meta.toolCallNames,
            timedOut: meta.timedOut,
          });
        },
      });
    } catch (error) {
      if (error instanceof DeepSeekApiError && error.timedOut) {
        timedOut = true;
      }
      throw error;
    }
  };

  try {
    for (let i = 0; i < MAX_AGENT_ITERATIONS; i += 1) {
      iterations = i + 1;
      modelCalls += 1;

      const message = await complete({
        messages: conversation,
        tools: TOOL_DEFINITIONS,
      });

      const toolCalls = message.tool_calls ?? [];
      if (toolCalls.length === 0) {
        const raw = message.content?.trim() || INSUFFICIENT_EVIDENCE_ANSWER;
        const declaredIds = parseCitedEvidence(raw);
        citedIds = declaredIds.filter((id) => retrieved.has(id));
        invalidCitationIds = declaredIds.filter((id) => !retrieved.has(id));
        const visible = stripEvidenceBlock(raw) || INSUFFICIENT_EVIDENCE_ANSWER;

        const missingEvidence =
          requiresEvidence && citedIds.length === 0 && !isSafeInsufficientAnswer(visible);
        const unsupportedNegation = requiresEvidence && startsWithUnsupportedNegation(visible);

        if (missingEvidence || unsupportedNegation) {
          if (!retried && i < MAX_AGENT_ITERATIONS - 1) {
            retried = true;
            conversation.push(assistantMessage(message));
            conversation.push({ role: "user", content: FACT_RETRY_NUDGE });
            continue;
          }
          blockedUncitedBiography = true;
          if (missingEvidence) {
            citedIds = [];
            invalidCitationIds = declaredIds.filter((id) => !retrieved.has(id));
          }
          finalText = INSUFFICIENT_EVIDENCE_ANSWER;
          break;
        }

        const hasUnknownAffiliationEvidence = [...retrieved.values()].some(
          isAffiliationUnknownEvidence,
        );
        const question = latestUserText(messages);
        if (
          shouldBlockAffiliationGuess({
            question,
            answer: visible,
            hasUnknownAffiliationEvidence,
          })
        ) {
          finalText = buildAffiliationUnknownAnswer(question);
          break;
        }

        finalText = visible;
        break;
      }

      conversation.push(assistantMessage(message));

      for (const call of toolCalls) {
        const toolStarted = Date.now();
        const startOffsetMs = toolStarted - requestStartedAt;
        const { result, trace } = await executeTool(call.function.name, call.function.arguments);
        const durationMs = Date.now() - toolStarted;
        const inputChars = call.function.arguments.length;
        const outputChars = safeJsonLength(result.ok ? result.data : { error: result.error });
        const argsSummary = summarizeToolArgs(trace.input);

        traces.push({
          ...trace,
          durationMs,
          inputChars,
          outputChars,
        });

        if (debugEnabled) {
          toolPerf.push({
            toolName: call.function.name,
            startOffsetMs,
            endOffsetMs: startOffsetMs + durationMs,
            durationMs,
            inputChars,
            outputChars,
            argsSummary,
          });
        }

        if (result.error) {
          errors.push(`${call.function.name}: ${result.error}`);
        }
        for (const item of result.evidence) {
          if (item.id) {
            retrieved.set(item.id, item);
          }
        }
        conversation.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result.ok ? result.data : { error: result.error }),
        });
      }

      if (i === MAX_AGENT_ITERATIONS - 1) {
        reachedMaxIterations = true;
        finalText = `这次回答在工具调用次数上限处停止。${INSUFFICIENT_EVIDENCE_ANSWER}请换一个更具体的问题，或稍后再试。`;
      }
    }
  } catch (error) {
    if (error instanceof DeepSeekApiError && debugEnabled) {
      error.agentDebug = buildDebug();
    }
    throw error;
  }

  const debug = buildDebug();

  const sources = citedIds
    .map((id) => retrieved.get(id))
    .filter((item): item is Source => Boolean(item));

  return {
    answer: finalText,
    sources,
    ...(debugEnabled ? { debug } : {}),
  };
}

function sanitizeClientMessages(messages: ClientMessage[]): ChatMessage[] {
  return messages
    .filter((message) => message.content.trim().length > 0)
    .slice(-20)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

function assistantMessage(message: DeepSeekChoiceMessage): ChatMessage {
  return {
    role: "assistant",
    content: message.content,
    tool_calls: message.tool_calls,
    reasoning_content: message.reasoning_content,
  };
}
