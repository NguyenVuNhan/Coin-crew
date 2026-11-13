import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PayInfo } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { useIsCoarsePointer } from '@cc/web-util/media';
import { Icon } from '@cc/web-ui/components/icons';
import { PayQr } from './PayQr';

type Bank = NonNullable<PayInfo['bank']>;

/** One "label · value · copy" row of the account card. */
function CopyRow({
  label,
  value,
  copyLabel,
  copied,
  onCopy,
  first,
}: {
  label: string;
  value: ReactNode;
  copyLabel: string;
  copied: boolean;
  onCopy: () => void;
  first?: boolean;
}) {
  return (
    <div className={`fsl-pay__row flex justify-between items-center gap-3 min-h-11 text-sm${first ? '' : ' border-t border-border'}`}>
      <span className="fsl-pay__row-label text-muted-foreground">{label}</span>
      <span className="fsl-pay__row-value text-foreground font-medium text-right flex items-center gap-1 min-w-0">
        {value}
        <button
          type="button"
          className="fsl-pay__icon-btn inline-flex items-center justify-center min-w-11 min-h-11 lg:min-w-9 lg:min-h-9 p-0 bg-transparent border-0 text-muted-foreground cursor-pointer rounded-md transition-colors hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          aria-label={copyLabel}
          title={copyLabel}
          onClick={onCopy}
        >
          <Icon name={copied ? 'check' : 'copy'} size={16} />
        </button>
      </span>
    </div>
  );
}

/**
 * The pay page's body, shared by the group pay page and the request page (owner, 2026-11-12): the hero, the QR with
 * Open bank and Download QR, the account number and transfer note with copy buttons, the keep-note line, then the
 * page's own extras. On a wide screen the footer ("I've paid") follows inline; on a phone the caller puts it in the
 * Screen's sticky bottom bar.
 */
export function PayDetails({
  info,
  bank,
  hero,
  extras,
  footer,
  after,
  wide,
}: {
  info: PayInfo;
  bank: Bank;
  hero: ReactNode;
  extras?: ReactNode;
  footer?: ReactNode;
  /** After the footer: a way out of the page that must never come before paying (a guest's sign-in). */
  after?: ReactNode;
  wide: boolean;
}) {
  const t = useT();
  const coarse = useIsCoarsePointer();
  const [copiedField, setCopiedField] = useState<'account' | 'note' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = (field: 'account' | 'note', text: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        if (timer.current) clearTimeout(timer.current);
        setCopiedField(field);
        timer.current = setTimeout(() => {
          setCopiedField(null);
          timer.current = null;
        }, 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="fsl-pay__layout grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-8 lg:items-start">
      {hero}
      <div className="fsl-pay__qr lg:col-start-1 lg:row-start-1 lg:row-span-2 lg:min-w-0">
        <PayQr info={info} variant="pay" summary={false} />
      </div>
      <div className="fsl-pay__body flex flex-col gap-3 min-w-0 lg:col-start-2 lg:row-start-2">
        <div className="fsl-pay__rows bg-card border border-border rounded-xl px-4 py-2 flex flex-col">
          <CopyRow
            first
            label={t('pay.account')}
            value={<span className="fsl-pay__account-number tabular-nums">{bank.accountNumberMasked}</span>}
            copyLabel={t('pay.copyAccount')}
            copied={copiedField === 'account'}
            onCopy={() => copy('account', bank.accountNumber)}
          />
          <CopyRow
            label={t('pay.note')}
            value={
              <span className="fsl-pay__memo font-mono font-bold text-sm bg-secondary text-secondary-foreground px-2 py-0.5 rounded-md [overflow-wrap:anywhere]">
                {info.refCode}
              </span>
            }
            copyLabel={t('pay.copyNote')}
            copied={copiedField === 'note'}
            onCopy={() => copy('note', info.refCode)}
          />
          <span className="fsl-pay__sr sr-only" role="status">
            {copiedField ? t('pay.copied') : ''}
          </span>
        </div>
        <p className="fsl-pay__keep-note m-0 text-sm text-muted-foreground">{t('pay.keepNote')}</p>
        {!coarse && <p className="fsl-pay__scan-hint m-0 text-xs text-subtle-foreground">{t('pay.scanWithPhone')}</p>}
        {extras}
        {wide && footer}
        {after}
      </div>
    </div>
  );
}
