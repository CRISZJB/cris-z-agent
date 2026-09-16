/**
 * Public Demo Mode: ephemeral session isolation.
 * When enabled, never read or write shared `.data`.
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

  constructor(message = "公开演示模式不允许此写入操作。") {
    super(message);
    this.name = "DemoModeWriteError";
  }
}

/** Job Profile and shared `.data` writes remain forbidden in public demo. */
export function assertDemoWritable(): void {
  if (isPublicDemoMode()) {
    throw new DemoModeWriteError("公开演示模式不允许保存或修改 Job Profile / 共享本地数据。");
  }
}

export function demoForbiddenJson(message?: string) {
  return Response.json(
    {
      error: message ?? "公开演示模式不允许此写入操作。",
      demo_mode: true,
      code: "DEMO_MODE_FORBIDDEN",
    },
    { status: 403 },
  );
}

export class DemoQuotaError extends Error {
  readonly code: "DEMO_FILE_TOO_LARGE" | "DEMO_UPLOAD_LIMIT" | "DEMO_TEXT_TOO_LARGE";
  readonly status = 413 as const;

  constructor(
    code: "DEMO_FILE_TOO_LARGE" | "DEMO_UPLOAD_LIMIT" | "DEMO_TEXT_TOO_LARGE",
    message: string,
  ) {
    super(message);
    this.name = "DemoQuotaError";
    this.code = code;
  }
}

export function demoQuotaJson(error: DemoQuotaError) {
  return Response.json(
    {
      error: error.message,
      demo_mode: true,
      code: error.code,
    },
    { status: 413 },
  );
}

export function isSyntheticDemoDocumentId(documentId: string): boolean {
  return documentId.startsWith("demo-");
}
