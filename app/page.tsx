import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page home-page">
      <section className="hero home-hero">
        <p className="brand">Cris.Z Agent</p>
        <h1 className="home-subtitle">你的个人 AI 知识与工作助手</h1>
        <p className="lede">
          导入本地文件、按知识空间整理，结合本地检索与 DeepSeek 回答日常、学习、工作与求职问题。
        </p>
        <div className="home-actions">
          <Link className="home-card" href="/agent">
            <strong>开始聊天</strong>
            <span>按知识范围提问，查看来源</span>
          </Link>
          <Link className="home-card" href="/knowledge">
            <strong>知识库</strong>
            <span>上传 TXT / MD / PDF / DOCX</span>
          </Link>
          <Link className="home-card" href="/job-assistant">
            <strong>求职助手</strong>
            <span>按资料填写与 JD 匹配</span>
          </Link>
          <Link className="home-card" href="/settings">
            <strong>设置</strong>
            <span>模型、检索模式与知识库概况</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
