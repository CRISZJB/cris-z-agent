import Link from "next/link";
import { notFound } from "next/navigation";
import { loadProject, listProjects } from "@/lib/knowledge";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return listProjects().map((project) => ({ slug: project.slug }));
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const document = loadProject(slug);
  if (!document?.project) {
    notFound();
  }

  const { project, sections } = document;

  return (
    <main className="page project-page">
      <p className="brand">
        <Link href="/">作品集智能体</Link>
      </p>
      {project.isDemo ? <p className="demo-flag">演示内容</p> : null}
      <h1>{project.title}</h1>
      <p className="lede">{project.summary}</p>
      <dl className="project-meta">
        <div>
          <dt>背景</dt>
          <dd>{project.company}</dd>
        </div>
        <div>
          <dt>角色</dt>
          <dd>{project.role}</dd>
        </div>
        <div>
          <dt>时间</dt>
          <dd>{project.period}</dd>
        </div>
      </dl>
      {sections.map((section) => (
        <section key={section.heading} className="project-section">
          <h2>{section.heading}</h2>
          {section.content.split("\n\n").map((paragraph) => (
            <p key={paragraph.slice(0, 40)}>{paragraph}</p>
          ))}
        </section>
      ))}
      <p className="index-note">
        <Link href="/agent">向智能体追问这个项目</Link>
      </p>
    </main>
  );
}
