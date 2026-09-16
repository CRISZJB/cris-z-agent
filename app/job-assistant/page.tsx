import { JobAssistantPanel } from "@/components/job/JobAssistantPanel";

export const metadata = {
  title: "求职助手",
  description: "基于 job 知识空间的填写与 JD 匹配助手。",
};

export default function JobAssistantPage() {
  return (
    <main className="page">
      <header className="agent-header">
        <p className="brand">求职助手</p>
        <h1>用真实资料填写，不编造能力</h1>
        <p className="identity-note">
          缺失字段会标记为 [需要人工补充]。生成型内容会标明【生成建议】。可在本页维护 / 导入 Job Profile；原始简历请导入到「求职」知识空间作为核验材料。
        </p>
      </header>
      <JobAssistantPanel />
    </main>
  );
}
