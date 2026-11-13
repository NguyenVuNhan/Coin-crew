/**
 * Errors are logged through this so bank account numbers never reach Cloudflare's logs.
 * Drizzle's query errors carry the bound values (`Failed query: … params: …`), and a failed bank
 * details write would print the account number there. This drops those values and masks any
 * run of 6 or more digits (account numbers; amounts get masked too, which a log can live without).
 */

const LONG_DIGITS = /\d(?:[ .-]?\d){5,}/g;
const PARAMS_LINE = /\nparams:[\s\S]*$/;

export function scrubText(text: string): string {
  return text.replace(PARAMS_LINE, '\nparams: [redacted]').replace(LONG_DIGITS, '[redacted]');
}

export interface SafeError {
  name: string;
  message: string;
  stack?: string;
  cause?: SafeError | string;
}

/** A copy of `err` (and up to 5 causes) that is safe to log. Never keeps `params` or other fields. */
export function safeError(err: unknown, depth = 0): SafeError | string {
  if (!(err instanceof Error)) return scrubText(String(err));
  const out: SafeError = { name: err.name, message: scrubText(err.message) };
  if (err.stack) out.stack = scrubText(err.stack);
  if (err.cause !== undefined && depth < 5) out.cause = safeError(err.cause, depth + 1);
  return out;
}
