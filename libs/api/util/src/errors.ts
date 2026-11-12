import type { ApiErrorCode } from '@cc/core';

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    public status: number,
    message?: string,
    /** Extra fields sent next to `code` and `message` in the error body. */
    public extra?: Record<string, unknown>,
  ) {
    super(message ?? code);
    this.name = 'ApiError';
  }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return Response.json({ error: { ...err.extra, code: err.code, message: err.message } }, { status: err.status });
  }

  if (isDailyLimit(err)) {
    return Response.json(
      // Users see a maintenance line, never the plan limit (the web copy for DAILY_LIMIT says the same).
      { error: { code: 'DAILY_LIMIT', message: 'CoinCrew is down for maintenance. Try again after 07:00.' } },
      { status: 503 },
    );
  }

  console.error(err);
  return Response.json(
    { error: { code: 'INTERNAL', message: 'Something went wrong.' } },
    { status: 500 },
  );
}

/**
 * D1's Workers Free daily row limit, enforced since 2026-09-01 and reset at 00:00 UTC (07:00 in Vietnam):
 * "Your account has exceeded D1's free tier daily row read limit." (or "row write limit"), sometimes after a
 * `D1_ERROR: ` prefix. Source: https://developers.cloudflare.com/d1/observability/debug-d1/
 * Drizzle wraps query errors, so the D1 text may sit in `cause`. The match is exact on purpose: Drizzle's own
 * message carries the failed SQL (`limit ?`), and the storage-limit error does not reset overnight.
 */
const DAILY_LIMIT_TEXT = /free tier daily row (read|write) limit/i;

function isDailyLimit(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e instanceof Error && depth < 5; e = e.cause, depth++) {
    if (DAILY_LIMIT_TEXT.test(e.message)) return true;
  }
  return false;
}

/** True when a database error (or one it wraps) mentions `text`, e.g. 'UNIQUE constraint failed'. */
export function isDbError(err: unknown, text: string): boolean {
  for (let e: unknown = err, depth = 0; e instanceof Error && depth < 5; e = e.cause, depth++) {
    if (e.message.includes(text)) return true;
  }
  return false;
}
