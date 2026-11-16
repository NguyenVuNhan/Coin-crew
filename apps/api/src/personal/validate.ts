import type { Context } from 'hono';
import { ApiError } from '@cc/api-util/errors';

export async function parseJson<T = Record<string, unknown>>(c: Context): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
}

export function requireDate(v: unknown): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new ApiError('VALIDATION', 422, 'Invalid date');
  }
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  if (
    Number.isNaN(dt.getTime()) ||
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() + 1 !== m ||
    dt.getUTCDate() !== d
  ) {
    throw new ApiError('VALIDATION', 422, 'Invalid date');
  }
  return v;
}

export function optionalTime(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v)) {
    throw new ApiError('VALIDATION', 422, 'Invalid time');
  }
  return v;
}

export function name1to40(v: unknown): string {
  if (typeof v !== 'string') {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
  const trimmed = v.trim();
  if (trimmed.length < 1 || trimmed.length > 40) {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
  return trimmed;
}
