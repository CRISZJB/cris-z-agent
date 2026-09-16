import type { AgentDebug, AgentPerf } from "@/lib/agent/types";

function formatSeconds(ms: number) {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatChars(n: number) {
  if (n >= 10_000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return String(n);
}

export function DebugPanel({ debug }: { debug: AgentDebug }) {
  const perf = debug.perf;

  return (
    <section className="debug-panel" aria-label="开发调试信息">
      <h2>调试</h2>
      <p>
        模型调用 {debug.modelCalls} 次 · 循环 {debug.iterations} 轮
        {debug.reachedMaxIterations ? " · 已达上限" : ""}
        {perf ? ` · request ${perf.requestId}` : ""}
      </p>
      <p>检索到的证据：{debug.retrievedEvidenceIds.join(", ") || "（无）"}</p>
      <p>
        事实保护：{debug.factGuard.retried ? "已强制再检索" : "未触发再检索"}
        {debug.factGuard.blockedUncitedBiography ? " · 已拦截无证据履历回答" : ""}
      </p>
      {debug.errors.length > 0 ? (
        <ul className="debug-errors">
          {debug.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}

      {perf ? <PerfSummary perf={perf} /> : null}

      {!perf && debug.toolCalls.length > 0 ? (
        <ol>
          {debug.toolCalls.map((call, index) => (
            <li key={`${call.name}-${index}`}>
              <strong>{call.name}</strong>
              {call.durationMs != null ? ` · ${formatSeconds(call.durationMs)}` : ""}
              {call.outputChars != null ? ` · out ${formatChars(call.outputChars)}c` : ""}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function PerfSummary({ perf }: { perf: AgentPerf }) {
  const timeline = buildTimeline(perf);

  return (
    <div className="perf-summary">
      <h3>性能摘要</h3>
      <p>
        总耗时：{formatSeconds(perf.totalMs)}
        {perf.timedOut ? " · 发生 timeout" : ""}
      </p>
      <ol className="perf-timeline">
        {timeline.map((item) => (
          <li key={item.key}>
            <strong>{item.title}</strong>
            <ul>
              {item.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

function buildTimeline(perf: AgentPerf) {
  type Item = { key: string; order: number; title: string; lines: string[] };
  const items: Item[] = [];

  for (const call of perf.modelCalls) {
    const lines = [
      formatSeconds(call.durationMs),
      `input chars: ${formatChars(call.inputCharCount)}（messages ${call.inputMessageCount}）`,
      `tool result chars in context: ${formatChars(call.toolResultCharCount)}`,
      `tools defs: ${call.toolDefinitionCount}`,
    ];
    if (call.timedOut) {
      lines.push("TIMEOUT");
    } else if (call.hasToolCalls) {
      lines.push(`tool_calls: ${call.toolCallNames.join(", ") || call.toolCallCount}`);
    } else {
      lines.push(`final answer · finish_reason: ${call.finishReason ?? "null"}`);
    }
    items.push({
      key: `model-${call.modelCallIndex}`,
      order: call.startOffsetMs,
      title: `Model Call ${call.modelCallIndex + 1}`,
      lines,
    });
  }

  for (const [index, tool] of perf.toolCalls.entries()) {
    items.push({
      key: `tool-${index}-${tool.toolName}`,
      order: tool.startOffsetMs,
      title: `Tool: ${tool.toolName}`,
      lines: [
        formatSeconds(tool.durationMs),
        `input chars: ${formatChars(tool.inputChars)}`,
        `output chars: ${formatChars(tool.outputChars)}`,
        `args: ${tool.argsSummary}`,
      ],
    });
  }

  return items.sort((a, b) => a.order - b.order);
}
