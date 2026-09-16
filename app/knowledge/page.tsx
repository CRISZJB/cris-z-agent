import { KnowledgeUploader } from "@/components/knowledge/KnowledgeUploader";
import { isPublicDemoMode } from "@/lib/demo/mode";

export const metadata = {
  title: "知识库",
  description: "导入本地文件到 Cris.Z Agent 知识空间。",
};

export default function KnowledgePage() {
  return (
    <main className="page">
      <header className="agent-header">
        <p className="brand">知识库</p>
        <h1>导入文件，按空间整理</h1>
        <p className="identity-note">工作 / 求职 / 学习 / 个人 / 临时资料。导入后可在聊天中按范围检索。</p>
      </header>
      <KnowledgeUploader publicDemoMode={isPublicDemoMode()} />
    </main>
  );
}
