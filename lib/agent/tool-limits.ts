/** Limits for tool payloads sent to the model (local store stays full). */

/** Per search_knowledge hit content shown to the model. */
export const SEARCH_RESULT_CONTENT_MAX_CHARS = 800;

/** Default read_document budget when no chunk/section is specified. */
export const READ_DOCUMENT_DEFAULT_MAX_CHARS = 4000;

/** Per-section cap for legacy get_profile / get_project payloads. */
export const COMPAT_SECTION_MAX_CHARS = 700;

/** Soft cap for Sources UI preview; resolved from local store when possible. */
export const SOURCE_PREVIEW_MAX_CHARS = 400;

export function truncateForModel(
  text: string,
  maxChars: number,
): { text: string; truncated: boolean } {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (maxChars <= 0) {
    return { text: "", truncated: normalized.length > 0 };
  }
  if (normalized.length <= maxChars) {
    return { text: normalized, truncated: false };
  }
  if (maxChars === 1) {
    return { text: "…", truncated: true };
  }

  // Reserve 1 char for the ellipsis so callers can treat maxChars as a hard cap.
  const softMax = maxChars - 1;
  const window = normalized.slice(0, softMax);
  const lastBreak = Math.max(
    window.lastIndexOf("\n\n"),
    window.lastIndexOf("。"),
    window.lastIndexOf("；"),
    window.lastIndexOf(". "),
  );
  const cut = lastBreak > softMax * 0.6 ? lastBreak + (normalized[lastBreak] === "." ? 2 : 1) : softMax;
  const body = normalized.slice(0, Math.min(cut, softMax)).trimEnd();
  const withEllipsis = `${body}…`;
  return {
    text: withEllipsis.length <= maxChars ? withEllipsis : `${normalized.slice(0, softMax).trimEnd()}…`,
    truncated: true,
  };
}
