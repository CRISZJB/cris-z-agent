import type { ChatMessage } from "./types";

export function createRequestId() {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function measureMessageChars(messages: ChatMessage[]): {
  inputCharCount: number;
  toolResultCharCount: number;
} {
  let inputCharCount = 0;
  let toolResultCharCount = 0;
  for (const message of messages) {
    const contentChars = message.content?.length ?? 0;
    const toolCallChars = message.tool_calls
      ? message.tool_calls.reduce(
          (sum, call) => sum + call.function.name.length + call.function.arguments.length,
          0,
        )
      : 0;
    const total = contentChars + toolCallChars;
    inputCharCount += total;
    if (message.role === "tool") {
      toolResultCharCount += contentChars;
    }
  }
  return { inputCharCount, toolResultCharCount };
}

/** Summarize tool args without dumping private document bodies. */
export function summarizeToolArgs(input: unknown): string {
  if (input == null) {
    return "{}";
  }
  if (typeof input !== "object") {
    return truncate(`${input}`, 80);
  }
  const record = input as Record<string, unknown>;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string") {
      parts.push(`${key}=${truncate(value, 48)} (${value.length}c)`);
    } else if (typeof value === "number" || typeof value === "boolean") {
      parts.push(`${key}=${value}`);
    } else if (value == null) {
      parts.push(`${key}=null`);
    } else {
      const json = safeJsonLength(value);
      parts.push(`${key}:<${typeof value} ${json}c>`);
    }
  }
  return parts.join(", ") || "{}";
}

export function safeJsonLength(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
