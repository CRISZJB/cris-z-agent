/**
 * Public Demo Mode: read-only anonymous demo isolation.
 * When enabled, never read or write `.data`.
 */

export const DEMO_MAX_AGENT_MESSAGE_CHARS = 4000;
export const LOCAL_MAX_AGENT_MESSAGE_CHARS = 8000;

export function isPublicDemoMode(): boolean {
  return process.env.PUBLIC_DEMO_MODE?.trim().toLowerCase() === "true";
}

/** Single user/assistant message content cap for /api/agent. */
export function maxAgentMessageChars(): number {
  return isPublicDemoMode() ? DEMO_MAX_AGENT_MESSAGE_CHARS : LOCAL_MAX_AGENT_MESSAGE_CHARS;
}

/** Debug payloads are never allowed in public demo, even under next dev. */
export function allowAgentDebug(requested?: boolean): boolean {
  if (isPublicDemoMode()) {
    return false;
  }
  return process.env.NODE_ENV === "development" && requested === true;
}

export class DemoModeWriteError extends Error {
  readonly code = "DEMO_MODE_FORBIDDEN" as const;

  constructor(message = "公开演示模式已关闭上传与持久化写入。") {
    super(message);
    this.name = "DemoModeWriteError";
  }
}

export function assertDemoWritable(): void {
  if (isPublicDemoMode()) {
    throw new DemoModeWriteError();
  }
}

export function demoForbiddenJson(message?: string) {
  return Response.json(
    {
      error: message ?? "公开演示模式已关闭上传与持久化写入。",
      demo_mode: true,
      code: "DEMO_MODE_FORBIDDEN",
    },
    { status: 403 },
  );
}
