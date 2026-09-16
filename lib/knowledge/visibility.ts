import { AsyncLocalStorage } from "node:async_hooks";

export type ContentStatus = "demo" | "draft" | "published";
export type ContentAudience = "author" | "public";
export type KnowledgeSourceType = "uploaded" | "structured" | "legacy";

const requestAudience = new AsyncLocalStorage<ContentAudience>();
const requestIncludeLegacy = new AsyncLocalStorage<boolean>();

export function parseContentStatus(value: unknown, isDemoFlag?: unknown): ContentStatus {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "demo" || raw === "draft" || raw === "published") {
    return raw;
  }
  if (isDemoFlag === true) {
    return "demo";
  }
  return "draft";
}

/** Chat / daily-use: always public, except an explicit development demo toggle. */
export function resolveChatContentAudience(includeDemo?: boolean): ContentAudience {
  if (process.env.NODE_ENV === "production") {
    return "public";
  }
  return includeDemo === true ? "author" : "public";
}

/**
 * Normal chat defaults to excluding content/ legacy sources.
 * Development may opt in via include_legacy (or include_demo, which needs content/).
 * Production always false.
 */
export function resolveChatIncludeLegacy(includeLegacy?: boolean, includeDemo?: boolean): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  return includeLegacy === true || includeDemo === true;
}

export async function runWithContentAudience<T>(
  audience: ContentAudience,
  fn: () => Promise<T> | T,
): Promise<T> {
  return requestAudience.run(audience, fn);
}

export async function runWithIncludeLegacy<T>(
  includeLegacy: boolean,
  fn: () => Promise<T> | T,
): Promise<T> {
  return requestIncludeLegacy.run(includeLegacy, fn);
}

export async function runWithChatKnowledgeContext<T>(
  options: { audience: ContentAudience; includeLegacy: boolean },
  fn: () => Promise<T> | T,
): Promise<T> {
  return runWithContentAudience(options.audience, () =>
    runWithIncludeLegacy(options.includeLegacy, fn),
  );
}

export function getContentAudience(): ContentAudience {
  const scoped = requestAudience.getStore();
  if (scoped) {
    return scoped;
  }
  const override = process.env.CONTENT_AUDIENCE?.trim().toLowerCase();
  if (override === "public" || override === "author") {
    return override;
  }
  return process.env.NODE_ENV === "production" ? "public" : "author";
}

/**
 * Whether content/ legacy Markdown participates in knowledge load/search.
 * Chat requests set this via ALS (default false). Outside chat, default true
 * so portfolio pages / existing scripts keep working unless INCLUDE_LEGACY=false.
 */
export function shouldIncludeLegacy(): boolean {
  const scoped = requestIncludeLegacy.getStore();
  if (typeof scoped === "boolean") {
    return scoped;
  }
  const env = process.env.INCLUDE_LEGACY?.trim().toLowerCase();
  if (env === "1" || env === "true") {
    return true;
  }
  if (env === "0" || env === "false") {
    return false;
  }
  return true;
}

export function isVisibleToAudience(status: ContentStatus, audience = getContentAudience()) {
  if (audience === "author") {
    return true;
  }
  return status === "published";
}
