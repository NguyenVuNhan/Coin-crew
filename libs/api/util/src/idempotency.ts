import { ApiError } from './errors';

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** The body's `idempotencyKey`: absent (old clients) is null, anything malformed is 422. */
export function parseIdempotencyKey(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string' || !IDEMPOTENCY_KEY_RE.test(raw)) throw new ApiError('VALIDATION', 422, 'Invalid request');
  return raw;
}
