export function splitMarkdownSections(body: string): Array<{ heading: string; content: string }> {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const sections: Array<{ heading: string; content: string }> = [];
  let heading = "概述";
  let content: string[] = [];

  const flush = () => {
    const text = content.join("\n").trim();
    if (text.length > 0) {
      sections.push({ heading, content: text });
    }
    content = [];
  };

  for (const line of lines) {
    const match = /^(#{1,3})\s+(.+)$/.exec(line);
    if (match) {
      flush();
      heading = match[2].trim();
      continue;
    }
    content.push(line);
  }
  flush();
  return sections;
}

export function snippetFrom(text: string, query: string, maxLength = 180): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }

  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length >= 2);
  let index = 0;
  for (const token of tokens) {
    const found = compact.toLowerCase().indexOf(token);
    if (found >= 0) {
      index = Math.max(0, found - 40);
      break;
    }
  }

  const slice = compact.slice(index, index + maxLength);
  const prefix = index > 0 ? "…" : "";
  const suffix = index + maxLength < compact.length ? "…" : "";
  return `${prefix}${slice}${suffix}`;
}

export function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}
