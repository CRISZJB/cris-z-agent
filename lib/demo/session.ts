import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export const DEMO_SESSION_COOKIE = "cris_z_demo_session";

const SESSION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const demoSessionStore = new AsyncLocalStorage<string>();

export function isValidDemoSessionId(value: string | undefined | null): value is string {
  return typeof value === "string" && SESSION_ID_RE.test(value);
}

export function createDemoSessionId(): string {
  return randomUUID();
}

export function runWithDemoSession<T>(sessionId: string, fn: () => T): T {
  if (!isValidDemoSessionId(sessionId)) {
    throw new Error("无效的演示会话 ID。");
  }
  return demoSessionStore.run(sessionId, fn);
}

export function getDemoSessionId(): string | undefined {
  return demoSessionStore.getStore();
}

/** Require an active demo session context (after cookie binding). */
export function requireDemoSessionId(): string {
  const sessionId = getDemoSessionId();
  if (!isValidDemoSessionId(sessionId)) {
    throw new Error("缺少演示会话上下文。");
  }
  return sessionId;
}

/**
 * Resolve cookie value or mint a new UUID session id.
 * Never derive ids from name / IP / User-Agent.
 */
export function resolveDemoSessionId(cookieValue: string | undefined | null): {
  sessionId: string;
  isNew: boolean;
} {
  if (isValidDemoSessionId(cookieValue)) {
    return { sessionId: cookieValue, isNew: false };
  }
  return { sessionId: createDemoSessionId(), isNew: true };
}

export function demoSessionCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60,
  };
}
