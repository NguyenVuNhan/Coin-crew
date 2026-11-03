import { useT } from '../i18n';
import { Button } from './Button';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

export interface InlineErrorProps {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}

export function InlineError({ error, onRetry, className = '' }: InlineErrorProps) {
  const t = useT();

  let code: string | undefined;
  if (error && typeof error === 'object' && 'code' in error) {
    code = String((error as { code: unknown }).code);
  }

  let message: string;
  let showRetry = false;

  if (code === 'DAILY_LIMIT') {
    message = t('error.dailyLimit');
  } else if (code === 'RATE_LIMITED') {
    message = t('error.rateLimited');
  } else if (code === 'LINK_DEAD') {
    message = t('error.linkDead');
  } else if (code === 'LAST_IDENTITY') {
    message = t('error.lastIdentity');
  } else if (code === 'MERGE_STALE') {
    message = t('error.mergeStale');
  } else if (code === 'FUND_SHORT') {
    message = t('error.fundShort');
  } else if (code === 'RATING_LIMIT') {
    message = t('error.ratingLimit');
  } else if (code === 'VALIDATION') {
    if (error instanceof Error && error.message) {
      message = error.message;
    } else if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
      message = (error as { message: string }).message;
    } else {
      message = t('error.generic');
    }
  } else {
    message = t('error.generic');
    if (onRetry) {
      showRetry = true;
    }
  }

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
