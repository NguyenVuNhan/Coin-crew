import { useT } from '../i18n';
import { Button } from './Button';
import './InlineError.css';

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
  } else if (code === 'LINK_DEAD') {
    message = t('error.linkDead');
  } else {
    message = t('error.generic');
    if (onRetry) {
      showRetry = true;
    }
  }

  return (
    <div className={`fsl-inline-error ${className}`.trim()} role="alert">
      <div className="fsl-inline-error__message">{message}</div>
      {showRetry && onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}
