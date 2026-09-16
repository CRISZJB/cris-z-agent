export type ChatRole = "system" | "user" | "assistant" | "tool";

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type ChatMessage = {
  role: ChatRole;
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  reasoning_content?: string | null;
};

export type ClientMessage = {
  role: "user" | "assistant";
  content: string;
};

export type Source = {
  id: string;
  title: string;
  path: string;
  projectId?: string;
  projectName?: string;
  section?: string;
  href?: string;
  status?: "demo" | "draft" | "published";
  isDemo?: boolean;
  knowledgeSpace?: string;
  documentId?: string;
  sourceName?: string;
  snippet?: string;
  sourceType?: "uploaded" | "structured" | "legacy";
  contentType?: "general" | "resume";
  sectionType?: string;
  company?: string;
  role?: string;
  dateRange?: string;
  school?: string;
  major?: string;
  affiliationUnknown?: boolean;
};

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ToolTrace = {
  name: string;
  input: unknown;
  output: unknown;
  error?: string;
  /** Length-only timing; populated when debug/perf is enabled. */
  durationMs?: number;
  inputChars?: number;
  outputChars?: number;
};

export type ModelCallPerf = {
  modelCallIndex: number;
  startOffsetMs: number;
  endOffsetMs: number;
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

export type ToolCallPerf = {
  toolName: string;
  startOffsetMs: number;
  endOffsetMs: number;
  durationMs: number;
  inputChars: number;
  outputChars: number;
  /** Safe arg summary (keys/lengths only), never full private content. */
  argsSummary: string;
};

export type AgentPerf = {
  requestId: string;
  requestStartIso: string;
  requestEndIso: string;
  totalMs: number;
  modelCalls: ModelCallPerf[];
  toolCalls: ToolCallPerf[];
  timedOut: boolean;
};

export type AgentDebug = {
  iterations: number;
  modelCalls: number;
  reachedMaxIterations: boolean;
  toolCalls: ToolTrace[];
  retrievedEvidenceIds: string[];
  citedEvidenceIds: string[];
  invalidCitationIds: string[];
  factGuard: {
    retried: boolean;
    blockedUncitedBiography: boolean;
  };
  errors: string[];
  /** Present when debug is enabled; lengths/timings only. */
  perf?: AgentPerf;
};

export type AgentResponse = {
  answer: string;
  sources: Source[];
  debug?: AgentDebug;
};

export type DeepSeekTool = ToolDefinition;

export type DeepSeekChoiceMessage = {
  role: "assistant";
  content: string | null;
  tool_calls?: ToolCall[];
  reasoning_content?: string | null;
};

export type DeepSeekChatResponse = {
  choices: Array<{
    finish_reason: string | null;
    message: DeepSeekChoiceMessage;
  }>;
};

export type CreateChatCompletionInput = {
  messages: ChatMessage[];
  tools: ToolDefinition[];
};
