import Link from "next/link";
import type { ProjectMeta } from "@/lib/knowledge";

export function ProjectCard({ project }: { project: ProjectMeta }) {
  return (
    <article className="project-row">
      <p className="project-period">{project.period}</p>
      <div>
        <h3>
          <Link href={`/projects/${project.slug}`}>{project.title}</Link>
        </h3>
        <p>{project.summary}</p>
        {project.isDemo ? <p className="demo-flag">演示内容</p> : null}
      </div>
    </article>
  );
}
