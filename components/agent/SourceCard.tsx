import type { Source } from "@/lib/agent/types";
import { knowledgeSpaceLabel } from "@/lib/knowledge/spaces";
import {
  fragmentLabel,
  groupSourcesForDisplay,
  type SourceGroup,
} from "./groupSources";

/** User-facing sources list — groups by document / source name for display only. */
export function SourcesList({ sources }: { sources: Source[] }) {
  const groups = groupSourcesForDisplay(sources);
  if (groups.length === 0) {
    return null;
  }

  return (
    <>
      <p className="sources-heading">来源 · {groups.length}</p>
      <ul className="sources-list">
        {groups.map((group) => (
          <li key={group.key}>
            <SourceGroupCard group={group} />
          </li>
        ))}
      </ul>
    </>
  );
}

function SourceGroupCard({ group }: { group: SourceGroup }) {
  const space = group.knowledgeSpace ? knowledgeSpaceLabel(group.knowledgeSpace) : "";
  const kindHint =
    group.items.some((item) => item.contentType === "resume")
      ? "简历"
      : group.items.some((item) => item.sectionType === "experience" || item.company)
        ? "工作经历"
        : null;
  const countLine = `${group.items.length} 个相关${group.unitLabel}`;
  const meta = [space, kindHint, countLine].filter(Boolean).join(" · ");
  const badges: string[] = [];
  if (group.sourceType === "legacy") {
    badges.push("旧兼容资料");
  }
  if (group.isDemo) {
    badges.push("演示内容");
  }
  const suffix = badges.length > 0 ? `（${badges.join(" · ")}）` : "";

  return (
    <details className="source-card source-group">
      <summary>
        <strong>{group.title}</strong>
        {meta || suffix ? (
          <span>
            {meta}
            {suffix}
          </span>
        ) : null}
      </summary>
      <ul className="source-fragments">
        {group.items.map((source, index) => (
          <li key={`${source.id}-${index}`}>
            <SourceFragment source={source} index={index} />
          </li>
        ))}
      </ul>
    </details>
  );
}

function SourceFragment({ source, index }: { source: Source; index: number }) {
  const snippet = source.snippet?.trim();
  const label = fragmentLabel(source, index);

  return (
    <details className="source-fragment">
      <summary>{label}</summary>
      {snippet ? <p className="source-snippet">{snippet}</p> : <p className="source-snippet">（无预览）</p>}
    </details>
  );
}

/** @deprecated Prefer SourcesList; kept for single-source callers if any. */
export function SourceCard({ source }: { source: Source }) {
  return <SourcesList sources={[source]} />;
}
