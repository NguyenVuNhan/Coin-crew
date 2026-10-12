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

  if (err instanceof Error && /limit/i.test(err.message) && /row|exceed/i.test(err.message)) {
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
