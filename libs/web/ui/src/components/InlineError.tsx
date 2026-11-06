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

/**
 * The words for an error, as `InlineError` shows them: known codes get their own copy, a validation error keeps the
 * server's sentence, and anything else (a network failure, a server fault) gets the generic line, never a raw
 * "Failed to fetch". Use it where an error sits inside other text.
 */
export function errorText(error: unknown, t: ReturnType<typeof useT>): string {
  const code = errorCode(error);
  const key = code === undefined ? undefined : CODE_COPY[code];
  if (key) return t(key);
  if (code === 'VALIDATION') {
    if (error instanceof Error && error.message) return error.message;
    if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
      return (error as { message: string }).message;
    }
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
