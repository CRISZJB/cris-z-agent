const EVIDENCE_BLOCK =
  /<evidence>\s*([\s\S]*?)\s*<\/evidence>/i;

export function parseCitedEvidence(text: string): string[] {
  const match = EVIDENCE_BLOCK.exec(text);
  if (!match) {
    return [];
  }
  return uniqueIds(match[1] ?? "");
}

export function stripEvidenceBlock(text: string): string {
  return text.replace(EVIDENCE_BLOCK, "").trim();
}

function uniqueIds(block: string) {
  const ids = block
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !item.startsWith("#"));
  return [...new Set(ids)];
}
