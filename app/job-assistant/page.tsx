import { JobAssistantPanel } from "@/components/job/JobAssistantPanel";
import { isPublicDemoMode } from "@/lib/demo/mode";

export const metadata = {
  title: "求职助手",
  description: "基于 job 知识空间的填写与 JD 匹配助手。",
};

export default function JobAssistantPage() {
  const demo = isPublicDemoMode();
  return (
    <main className="page">
      <header className="agent-header">
        <p className="brand">求职助手</p>
        <h1>用真实资料填写，不编造能力</h1>
        <p className="identity-note">
          {demo
            ? "公开演示模式：可查看匿名 Job Profile 并体验字段填写；保存与导入已关闭。"
            : "缺失字段会标记为 [需要人工补充]。生成型内容会标明【生成建议】。可在本页维护 / 导入 Job Profile；原始简历请导入到「求职」知识空间作为核验材料。"}
        </p>
      </header>
      <JobAssistantPanel publicDemoMode={demo} />
    </main>
  );
}
