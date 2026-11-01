import { cn } from '@/lib/utils';
import { Sheet } from './Sheet';
import { BANK_APPS, bankAppLink, PREFILL_VERIFIED } from '@fsl/core';
import { useT } from '../i18n';
import { isZaloWebView } from '../lib/zaloEnv';

export interface BankAppSheetProps {
  open: boolean;
  onClose(): void;
}

export function BankAppSheet({ open, onClose }: BankAppSheetProps) {
  const t = useT();

  const isIos =
    typeof navigator !== 'undefined' && /iPhone|iPad/.test(navigator.userAgent);
  const rawApps = isIos ? BANK_APPS.ios : BANK_APPS.android;

  const apps = PREFILL_VERIFIED
    ? [...rawApps].sort((a, b) => (b.autofill ? 1 : 0) - (a.autofill ? 1 : 0))
    : rawApps;

  return (
    <Sheet open={open} onClose={onClose} title={t('pay.chooseApp')}>
      <div className={cn('fsl-bank-app-sheet__list bg-card rounded-xl border border-border divide-y divide-border overflow-hidden max-h-[60vh] overflow-y-auto')}>
        {apps.map((app) => (
          <a
            key={app.appId}
            href={bankAppLink(app.appId)}
            className={cn('fsl-bank-app-sheet__row flex flex-col justify-center min-h-11 px-4 py-3 text-foreground no-underline transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none')}
          >
            <span className={cn('fsl-bank-app-sheet__name font-semibold text-base')}>{app.appName}</span>
            {PREFILL_VERIFIED && app.autofill && (
              <span className={cn('fsl-bank-app-sheet__hint text-xs text-muted-foreground mt-1')}>
                {t('pay.fillsIn')}
              </span>
            )}
          </a>
        ))}
      </div>
      {isZaloWebView() && (
        <p className={cn('fsl-bank-app-sheet__zalo-hint mt-3 text-sm text-muted-foreground leading-normal')}>
          {t('pay.zaloBankHint')}
        </p>
      )}
    </Sheet>
  );
}

