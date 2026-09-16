const TARGET_CHARS = 900;
const OVERLAP_CHARS = 120;

export function chunkPlainText(text: string): Array<{ section: string; content: string; index: number }> {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: Array<{ section: string; content: string; index: number }> = [];
  let buffer = "";

  const flush = () => {
    const content = buffer.trim();
    if (!content) {
      return;
    }
    const index = chunks.length + 1;
    chunks.push({
      section: `片段 ${String(index).padStart(3, "0")}`,
      content,
      index,
    });
    if (content.length > OVERLAP_CHARS) {
      buffer = content.slice(-OVERLAP_CHARS);
    } else {
      buffer = "";
    }
  };

  for (const paragraph of paragraphs) {
    if (!buffer) {
      buffer = paragraph;
    } else if (`${buffer}\n\n${paragraph}`.length <= TARGET_CHARS) {
      buffer = `${buffer}\n\n${paragraph}`;
    } else {
      flush();
      buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
      if (buffer.length > TARGET_CHARS * 1.5) {
        // Hard split very long paragraphs.
        while (buffer.length > TARGET_CHARS) {
          const slice = buffer.slice(0, TARGET_CHARS);
          const cut = Math.max(slice.lastIndexOf("。"), slice.lastIndexOf("\n"), Math.floor(TARGET_CHARS * 0.7));
          const piece = buffer.slice(0, cut + 1).trim();
          buffer = buffer.slice(cut + 1).trim();
          if (piece) {
            const index = chunks.length + 1;
            chunks.push({
              section: `片段 ${String(index).padStart(3, "0")}`,
              content: piece,
              index,
            });
          }
        }
      }
    }
  }

  if (buffer.trim()) {
    const content = buffer.trim();
    const index = chunks.length + 1;
    chunks.push({
      section: `片段 ${String(index).padStart(3, "0")}`,
      content,
      index,
    });
  }

  return chunks;
}

export function evidenceIdForChunk(documentId: string, chunkIndex: number): string {
  return `${documentId}:chunk-${String(chunkIndex).padStart(3, "0")}`;
}
