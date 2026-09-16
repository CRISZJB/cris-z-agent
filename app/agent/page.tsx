import { AgentChat } from "@/components/agent/AgentChat";

export const metadata = {
  title: "聊天",
  description: "Cris.Z Agent：按知识范围提问，并查看来源。",
};

export default function AgentPage() {
  // Debug UI is only available in development; still defaults off until user toggles.
  const debugAvailable = process.env.NODE_ENV === "development";

  return (
    <main className="page agent-page">
      <header className="agent-header">
        <p className="brand">Cris.Z Agent</p>
        <h1>日常、学习、工作与求职，都可以直接问。</h1>
        <p className="identity-note">
          个人事实只依据本地知识库；通用问题可直接由 DeepSeek 回答。回答若引用资料会显示来源。推理时相关片段会发送给 DeepSeek
          API。
        </p>
      </header>
      <AgentChat debugAvailable={debugAvailable} />
    </main>
  );
}
