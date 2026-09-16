import { countDocumentsBySpace, listStoredDocuments } from "@/lib/documents";
import { getRetrievalConfig } from "@/lib/knowledge/retrieval-config";
import { KNOWLEDGE_SPACES } from "@/lib/knowledge/spaces";
import { isPublicDemoMode } from "@/lib/demo/mode";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "设置",
};

export default function SettingsPage() {
  const retrieval = getRetrievalConfig();
  const counts = countDocumentsBySpace();
  const total = listStoredDocuments("all").length;
  const hasKey = Boolean(process.env.DEEPSEEK_API_KEY?.trim());
  const model = process.env.DEEPSEEK_MODEL?.trim() || "（未配置 DEEPSEEK_MODEL）";
  const demo = isPublicDemoMode();

  return (
    <main className="page">
      <header className="agent-header">
        <p className="brand">设置</p>
        <h1>运行概况</h1>
      </header>

      <section className="settings-panel">
        <dl>
          <div>
            <dt>运行模式</dt>
            <dd>{demo ? "公开演示模式（匿名只读）" : "本地完整模式"}</dd>
          </div>
          <div>
            <dt>DeepSeek 模型</dt>
            <dd>{model}</dd>
          </div>
          <div>
            <dt>API Key</dt>
            <dd>{hasKey ? "已配置（不展示）" : "未配置：请在环境变量填写 DEEPSEEK_API_KEY"}</dd>
          </div>
          <div>
            <dt>Retrieval Mode</dt>
            <dd>{retrieval.mode}（默认 bm25；可改 RETRIEVAL_MODE）</dd>
          </div>
          <div>
            <dt>{demo ? "演示文档" : "已导入文档"}</dt>
            <dd>{total}</dd>
          </div>
        </dl>

        <h2>知识空间</h2>
        <ul className="space-stats">
          {KNOWLEDGE_SPACES.map((space) => (
            <li key={space.id}>
              <strong>{space.label}</strong>
              <span>{counts[space.id]} 个文档</span>
            </li>
          ))}
        </ul>

        <p className="privacy-note">
          {demo
            ? "公开演示模式使用仓库内匿名 demo 数据，不读取本地 .data，也不接受上传。"
            : "原始文件与元数据在本地 .data/。DeepSeek 推理时会发送检索到的相关片段，不是完全本地。"}
        </p>
      </section>
    </main>
  );
}
