"use client";

import { useState } from "react";
import { ChatInput } from "./ChatInput";
import { DebugPanel } from "./DebugPanel";
import { Message, type ChatMessageView } from "./Message";
import { SuggestedQuestions } from "./SuggestedQuestions";
import type { AgentDebug, Source } from "@/lib/agent/types";
import { KNOWLEDGE_SPACES, type KnowledgeScope } from "@/lib/knowledge/spaces";

const SUGGESTED_QUESTIONS = [
  "我的资料里有没有写 RAG？",
  "总结一下当前知识库里最近导入的内容。",
  "什么是 RAG？",
  "结合我的资料，MCP 可以怎么用？",
];

type AgentChatProps = {
  /** Only true in development; production must pass false. */
  debugAvailable?: boolean;
};

export function AgentChat({ debugAvailable = false }: AgentChatProps) {
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [pending, setPending] = useState(false);
  const [debug, setDebug] = useState<AgentDebug | null>(null);
  const [knowledgeScope, setKnowledgeScope] = useState<KnowledgeScope>("all");
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [includeDemo, setIncludeDemo] = useState(false);
  const [includeLegacy, setIncludeLegacy] = useState(false);

  const wantDebug = Boolean(debugAvailable && debugEnabled);

  async function send(text: string) {
    const userMessage: ChatMessageView = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setPending(true);
    setDebug(null);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          debug: wantDebug,
          knowledge_space: knowledgeScope,
          include_demo: Boolean(debugAvailable && includeDemo),
          include_legacy: Boolean(debugAvailable && includeLegacy),
        }),
      });
      const payload = (await response.json()) as {
        answer?: string;
        sources?: Source[];
        debug?: AgentDebug;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "暂时无法回答。");
      }

      setMessages([
        ...nextMessages,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: payload.answer || "目前资料中没有足够信息支持这个结论。",
          sources: payload.sources ?? [],
        },
      ]);
      setDebug(wantDebug ? (payload.debug ?? null) : null);
    } catch (error) {
      setMessages([
        ...nextMessages,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          error: true,
          content: error instanceof Error ? error.message : "暂时无法回答。",
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="agent-shell">
      <div className="agent-toolbar">
        <div className="scope-bar">
          <label htmlFor="knowledge-scope">知识范围</label>
          <select
            id="knowledge-scope"
            value={knowledgeScope}
            disabled={pending}
            onChange={(event) => setKnowledgeScope(event.target.value as KnowledgeScope)}
          >
            <option value="all">全部知识</option>
            {KNOWLEDGE_SPACES.map((space) => (
              <option key={space.id} value={space.id}>
                {space.label}
              </option>
            ))}
          </select>
        </div>

        {debugAvailable ? (
          <div className="dev-toggles">
            <label className="debug-toggle">
              <input
                type="checkbox"
                checked={includeLegacy}
                disabled={pending}
                onChange={(event) => setIncludeLegacy(event.target.checked)}
              />
              使用旧兼容数据
            </label>
            <label className="debug-toggle">
              <input
                type="checkbox"
                checked={includeDemo}
                disabled={pending}
                onChange={(event) => setIncludeDemo(event.target.checked)}
              />
              使用演示数据
            </label>
            <label className="debug-toggle">
              <input
                type="checkbox"
                checked={debugEnabled}
                disabled={pending}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setDebugEnabled(checked);
                  if (!checked) {
                    setDebug(null);
                  }
                }}
              />
              开发调试
            </label>
          </div>
        ) : null}
      </div>

      {messages.length === 0 ? (
        <SuggestedQuestions questions={SUGGESTED_QUESTIONS} onSelect={send} disabled={pending} />
      ) : null}

      <div className="message-list" aria-live="polite">
        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
        {pending ? <p className="pending-note">正在思考…</p> : null}
      </div>

      <ChatInput disabled={pending} onSend={send} />
      {wantDebug && debug ? <DebugPanel debug={debug} /> : null}
    </div>
  );
}
