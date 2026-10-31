import type { ApiErrorCode } from '@fsl/core';

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    public status: number,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ApiError';
  }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }

  if (isDailyLimit(err)) {
    return Response.json(
      { error: { code: 'DAILY_LIMIT', message: "We're over today's free limit. Try again after 07:00." } },
      { status: 503 },
    );
  }

  console.error(err);
  return Response.json(
    { error: { code: 'INTERNAL', message: 'Something went wrong.' } },
    { status: 500 },
  );
}

/** D1's daily free-plan limit error. Drizzle wraps query errors, so the D1 text may sit in `cause`. */
function isDailyLimit(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e instanceof Error && depth < 5; e = e.cause, depth++) {
    if (/limit/i.test(e.message) && /row|exceed/i.test(e.message)) return true;
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
