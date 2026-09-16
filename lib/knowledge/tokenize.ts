const CJK = /[\u4e00-\u9fff]/;
const LATIN = /[a-z0-9]+/g;

export function tokenize(text: string): string[] {
  const normalized = text.toLowerCase();
  const tokens: string[] = [];

  const latin = normalized.match(LATIN) ?? [];
  tokens.push(...latin);

  let buffer = "";
  for (const char of normalized) {
    if (CJK.test(char)) {
      buffer += char;
    } else if (buffer.length > 0) {
      pushCjkTokens(buffer, tokens);
      buffer = "";
    }
  }
  if (buffer.length > 0) {
    pushCjkTokens(buffer, tokens);
  }

  return tokens;
}

function pushCjkTokens(sequence: string, tokens: string[]) {
  for (const char of sequence) {
    tokens.push(char);
  }
  for (let i = 0; i < sequence.length - 1; i += 1) {
    tokens.push(sequence.slice(i, i + 2));
  }
}
