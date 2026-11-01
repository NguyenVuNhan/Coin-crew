import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Sheet } from './Sheet';
import { BANK_APPS, bankAppLink, PREFILL_VERIFIED } from '@fsl/core';
import { useT } from '../i18n';
import { isZaloWebView } from '../lib/zaloEnv';
import { usePlatform } from '../platform';

export interface BankAppSheetProps {
  open: boolean;
  onClose(): void;
}

export function BankAppSheet({ open, onClose }: BankAppSheetProps) {
  const t = useT();
  const platform = usePlatform();
  const [blocked, setBlocked] = useState(false);

  const isIos =
    typeof navigator !== 'undefined' && /iPhone|iPad/.test(navigator.userAgent);
  const rawApps = isIos ? BANK_APPS.ios : BANK_APPS.android;

  const apps = PREFILL_VERIFIED
    ? [...rawApps].sort((a, b) => (b.autofill ? 1 : 0) - (a.autofill ? 1 : 0))
    : rawApps;

  return (
    <Sheet open={open} onClose={onClose} title={t('pay.chooseApp')}>
      <div className={cn('fsl-bank-app-sheet__list bg-card rounded-xl border border-border divide-y divide-border overflow-hidden max-h-[60vh] overflow-y-auto')}>
        {apps.map((app) => {
          const content = (
            <>
              <span className={cn('fsl-bank-app-sheet__name font-semibold text-base')}>{app.appName}</span>
              {PREFILL_VERIFIED && app.autofill && (
                <span className={cn('fsl-bank-app-sheet__hint text-xs text-muted-foreground mt-1')}>
                  {t('pay.fillsIn')}
                </span>
              )}
            </>
          );
          if (platform.kind === 'zmp') {
            return (
              <button
                key={app.appId}
                type="button"
                onClick={async () => {
                  const r = await platform.openExternal(bankAppLink(app.appId));
                  if (r === 'blocked') {
                    setBlocked(true);
                  }
                }}
                className={cn('fsl-bank-app-sheet__row flex flex-col justify-center min-h-11 px-4 py-3 text-foreground no-underline transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none text-left w-full bg-transparent border-0')}
              >
                {content}
              </button>
            );
          }
          return (
            <a
              key={app.appId}
              href={bankAppLink(app.appId)}
              className={cn('fsl-bank-app-sheet__row flex flex-col justify-center min-h-11 px-4 py-3 text-foreground no-underline transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none')}
            >
              {content}
            </a>
          );
        })}
      </div>
      {blocked && (
        <p className={cn('fsl-bank-app-sheet__fallback mt-3 text-sm text-muted-foreground leading-normal')}>
          {t('pay.bankFallback')}
        </p>
      )}
      {platform.kind !== 'zmp' && isZaloWebView() && (
        <p className={cn('fsl-bank-app-sheet__zalo-hint mt-3 text-sm text-muted-foreground leading-normal')}>
          {t('pay.zaloBankHint')}
        </p>
      )}
    </Sheet>
  );
}

