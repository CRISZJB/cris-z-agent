import Link from "next/link";

export function Hero() {
  return (
    <section className="hero">
      <div className="hero-copy">
        <p className="brand">作品集智能体</p>
        <h1>向我的经历提问。</h1>
        <p className="lede">
          招聘方不必翻完整份作品集。可以直接问项目判断、取舍和人工智能产品能力。
        </p>
        <div className="hero-actions">
          <Link className="primary-link" href="/agent">
            问问我的人工智能作品集
          </Link>
          <a className="quiet-link" href="#projects">
            先看案例
          </a>
        </div>
      </div>
      <div className="hero-visual" aria-hidden="true">
        <p className="hero-question">你最有代表性的人工智能项目是什么？</p>
      </div>
    </section>
  );
}
