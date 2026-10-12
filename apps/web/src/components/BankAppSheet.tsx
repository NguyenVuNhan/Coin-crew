import { Sheet } from './Sheet';
import { BANK_APPS, bankAppLink, PREFILL_VERIFIED } from '@fsl/core';
import { useT } from '../i18n';
import './BankAppSheet.css';

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
      <div className="fsl-bank-app-sheet__list">
        {apps.map((app) => (
          <a
            key={app.appId}
            href={bankAppLink(app.appId)}
            className="fsl-bank-app-sheet__row"
          >
            <span className="fsl-bank-app-sheet__name">{app.appName}</span>
            {PREFILL_VERIFIED && app.autofill && (
              <span className="fsl-bank-app-sheet__hint">
                {t('pay.fillsIn')}
              </span>
            )}
          </a>
        ))}
      </div>
    </Sheet>
  );
}
