import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page">
      <p className="brand">作品集智能体</p>
      <h1>没有找到这个页面。</h1>
      <p className="lede">
        可以回到 <Link href="/">首页</Link>，或直接 <Link href="/agent">向智能体提问</Link>。
      </p>
    </main>
  );
}
