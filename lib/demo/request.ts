import { NextRequest, NextResponse } from "next/server";
import { cleanupExpiredDemoSessions, touchDemoSession } from "./ephemeral";
import { isPublicDemoMode } from "./mode";
import {
  DEMO_SESSION_COOKIE,
  demoSessionCookieOptions,
  resolveDemoSessionId,
  runWithDemoSession,
} from "./session";

type HandlerResult = Response | NextResponse;

function toNextResponse(response: HandlerResult): NextResponse {
  if (response instanceof NextResponse) {
    return response;
  }
  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function attachDemoSessionCookie(response: NextResponse, sessionId: string): NextResponse {
  response.cookies.set(DEMO_SESSION_COOKIE, sessionId, demoSessionCookieOptions());
  return response;
}

/**
 * Bind demo session from cookie (or mint one), run handler inside ALS,
 * attach HttpOnly cookie, and opportunistically clean expired sessions.
 */
export async function withDemoSessionContext(
  request: NextRequest | Request,
  handler: () => Promise<HandlerResult> | HandlerResult,
): Promise<NextResponse> {
  if (!isPublicDemoMode()) {
    return toNextResponse(await handler());
  }

  cleanupExpiredDemoSessions();

  const cookieHeader =
    "cookies" in request && typeof request.cookies?.get === "function"
      ? request.cookies.get(DEMO_SESSION_COOKIE)?.value
      : undefined;
  const rawCookie =
    cookieHeader ??
    parseCookieHeader(request.headers.get("cookie"), DEMO_SESSION_COOKIE);

  const { sessionId } = resolveDemoSessionId(rawCookie);
  touchDemoSession(sessionId);

  const result = await runWithDemoSession(sessionId, () => handler());
  return attachDemoSessionCookie(toNextResponse(result), sessionId);
}

function parseCookieHeader(header: string | null, name: string): string | undefined {
  if (!header) {
    return undefined;
  }
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return undefined;
}
