import { isValidationReason } from '@cc/core';
import { useT } from '@cc/web-i18n';
import type { MessageKey } from '@cc/web-i18n/en';
import { Button } from './Button';
import { Alert } from './ui/alert';
import { cn } from '../lib/utils';

export interface InlineErrorProps {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}

/** API error codes with their own words. */
const CODE_COPY: Record<string, MessageKey> = {
  DAILY_LIMIT: 'error.dailyLimit',
  RATE_LIMITED: 'error.rateLimited',
  LINK_DEAD: 'error.linkDead',
  LAST_IDENTITY: 'error.lastIdentity',
  MERGE_STALE: 'error.mergeStale',
  FUND_SHORT: 'error.fundShort',
  RATING_LIMIT: 'error.ratingLimit',
};

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : undefined;
}

/** Marks a form's own, already translated words, so `InlineError` shows them as they are. */
const OWN_TEXT = Symbol('ownErrorText');

/**
 * An error a screen writes itself (already in the reader's language), shown like a validation error: no Retry.
 * Server errors never show their text; only these do.
 */
export function ownError(message: string): { code: 'VALIDATION'; message: string } {
  return { code: 'VALIDATION', message, [OWN_TEXT]: true } as { code: 'VALIDATION'; message: string };
}

function ownText(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !(OWN_TEXT in error)) return undefined;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message ? message : undefined;
}

/** The `reason` a VALIDATION error body carries (`ApiClientError.details`), if it is one we have words for. */
function validationReason(error: unknown) {
  if (!error || typeof error !== 'object') return undefined;
  const details = (error as { details?: unknown }).details;
  const reason = details && typeof details === 'object' ? (details as { reason?: unknown }).reason : undefined;
  return isValidationReason(reason) ? reason : undefined;
}

/**
 * The words for an error, as `InlineError` shows them: known codes get their own copy, a validation error gets the
 * words for its reason (or a generic "check it" line), a screen's `ownError` keeps its text, and anything else (a
 * network failure, a server fault) gets the generic line. The server's English message is never shown. Use it where
 * an error sits inside other text.
 */
export function errorText(error: unknown, t: ReturnType<typeof useT>): string {
  const own = ownText(error);
  if (own) return own;
  const code = errorCode(error);
  const key = code === undefined ? undefined : CODE_COPY[code];
  if (key) return t(key);
  if (code === 'VALIDATION') {
    const reason = validationReason(error);
    return t(reason ? (`validation.${reason}` as MessageKey) : 'error.validation');
  }
  return t('error.generic');
}

export function InlineError({ error, onRetry, className = '' }: InlineErrorProps) {
  const t = useT();
  const code = errorCode(error);
  const message = errorText(error, t);
  // Retry helps only with the unexpected: a known code or a validation error would fail the same way again.
  const showRetry = Boolean(onRetry) && code !== 'VALIDATION' && (code === undefined || !(code in CODE_COPY));

  return (
    <Alert
      variant="destructive"
      role="alert"
      className={cn('fsl-inline-error', 'border-transparent bg-danger-soft text-danger', className)}
    >
      <div className="fsl-inline-error__message">{message}</div>
      {showRetry && onRetry && (
        <Button variant="secondary" onClick={onRetry} className="mt-2">
          {t('common.retry')}
        </Button>
      )}
    </Alert>
  );
}
