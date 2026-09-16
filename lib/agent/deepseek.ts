import { AgentConfigError, DEEPSEEK_TIMEOUT_MS, getDeepSeekConfig } from "./config";
import { measureMessageChars } from "./perf";
import type {
  CreateChatCompletionInput,
  DeepSeekChatResponse,
  DeepSeekChoiceMessage,
  ToolDefinition,
} from "./types";

export class DeepSeekApiError extends Error {
  status?: number;
  /** Partial agent debug/perf when timeout interrupts runAgent. */
  agentDebug?: import("./types").AgentDebug;
  timedOut?: boolean;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "DeepSeekApiError";
    this.status = status;
  }
}

export type ChatCompletionMeta = {
  durationMs: number;
  inputMessageCount: number;
  inputCharCount: number;
  toolResultCharCount: number;
  toolDefinitionCount: number;
  finishReason: string | null;
  hasToolCalls: boolean;
  toolCallCount: number;
  toolCallNames: string[];
  timedOut: boolean;
};

export type CreateChatCompletionOptions = {
  onMeta?: (meta: ChatCompletionMeta) => void;
};

export async function createChatCompletion(
  input: CreateChatCompletionInput,
  options?: CreateChatCompletionOptions,
): Promise<DeepSeekChoiceMessage> {
  const { apiKey, model, baseUrl } = getDeepSeekConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEEPSEEK_TIMEOUT_MS);
  const started = Date.now();
  const { inputCharCount, toolResultCharCount } = measureMessageChars(input.messages);
  const baseMeta = {
    inputMessageCount: input.messages.length,
    inputCharCount,
    toolResultCharCount,
    toolDefinitionCount: input.tools?.length ?? 0,
  };

  const emit = (partial: Omit<ChatCompletionMeta, keyof typeof baseMeta> & Partial<typeof baseMeta>) => {
    options?.onMeta?.({
      ...baseMeta,
      ...partial,
      durationMs: partial.durationMs ?? Date.now() - started,
    });
  };

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: input.messages,
        tools: input.tools,
        tool_choice: "auto",
      }),
      signal: controller.signal,
    });

    const raw = await response.text();
    if (!response.ok) {
      emit({
        durationMs: Date.now() - started,
        finishReason: null,
        hasToolCalls: false,
        toolCallCount: 0,
        toolCallNames: [],
        timedOut: false,
      });
      throw new DeepSeekApiError(
        `DeepSeek 请求失败（${response.status}）：${truncate(raw)}`,
        response.status,
      );
    }

    const data = JSON.parse(raw) as DeepSeekChatResponse;
    const choice = data.choices?.[0];
    const message = choice?.message;
    if (!message) {
      emit({
        durationMs: Date.now() - started,
        finishReason: choice?.finish_reason ?? null,
        hasToolCalls: false,
        toolCallCount: 0,
        toolCallNames: [],
        timedOut: false,
      });
      throw new DeepSeekApiError("DeepSeek 返回结果缺少 message。");
    }

    const toolCalls = message.tool_calls ?? [];
    emit({
      durationMs: Date.now() - started,
      finishReason: choice?.finish_reason ?? null,
      hasToolCalls: toolCalls.length > 0,
      toolCallCount: toolCalls.length,
      toolCallNames: toolCalls.map((call) => call.function.name),
      timedOut: false,
    });
    return message;
  } catch (error) {
    if (error instanceof AgentConfigError || error instanceof DeepSeekApiError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      const timeoutError = new DeepSeekApiError(`DeepSeek 请求超时（${DEEPSEEK_TIMEOUT_MS}ms）。`);
      timeoutError.timedOut = true;
      emit({
        durationMs: Date.now() - started,
        finishReason: null,
        hasToolCalls: false,
        toolCallCount: 0,
        toolCallNames: [],
        timedOut: true,
      });
      throw timeoutError;
    }
    emit({
      durationMs: Date.now() - started,
      finishReason: null,
      hasToolCalls: false,
      toolCallCount: 0,
      toolCallNames: [],
      timedOut: false,
    });
    throw new DeepSeekApiError(
      error instanceof Error ? `DeepSeek 请求异常：${error.message}` : "DeepSeek 请求异常。",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function toToolPayload(tools: ToolDefinition[]) {
  return tools;
}

function truncate(text: string, max = 400) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
