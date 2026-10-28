import { useEffect, useRef, useState, type JSX } from 'react';
import { formatVnd, type PayInfo } from '@fsl/core';
import { useT } from '../i18n';
import { copyText } from '../lib/clipboard';
import { qrPngBlob, qrSrc, saveQr, shareQr, useQrSvg } from '../lib/qr';
import { isZaloWebView } from '../lib/zaloEnv';
import { useIsCoarsePointer } from '../lib/media';
import { Skeleton } from './Skeleton';
import { Amount } from './Amount';
import { Button } from './Button';
import { BankAppSheet } from './BankAppSheet';
import { useImageSheet } from './SaveImageSheet';
import { Icon } from './icons';

export type PayQrProps = {
  info: PayInfo;
  /** Show the amount, the bank line and the note under the QR. False where the screen shows them itself. */
  summary?: boolean;
} & (
  | { variant: 'pay' }
  | { variant: 'receive'; shareText: string }
);

/** VietQR code with quick payment, saving, and sharing actions. */
export function PayQr(props: PayQrProps): JSX.Element | null {
  const { info, summary = true } = props;
  const t = useT();
  const svg = useQrSvg(info.payload);
  const coarse = useIsCoarsePointer();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'saved' | 'failed' | null>(null);
  const [copiedField, setCopiedField] = useState<'account' | 'note' | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { sheet: imageSheet, show: showImage } = useImageSheet();

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  if (info.amount === 0 || info.payload === null) {
    return null;
  }

  const handleCopy = (field: 'account' | 'note', text: string) => {
    void copyText(text).then((ok) => {
      if (ok) {
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        setCopiedField(field);
        copyTimerRef.current = setTimeout(() => {
          setCopiedField(null);
          copyTimerRef.current = null;
        }, 2000);
      }
    });
  };

  async function share(text: string) {
    if (isZaloWebView()) {
      showImage(() => qrPngBlob(svg), text);
      return;
    }
    setBusy(true);
    try {
      const result = await shareQr(svg, text, info.refCode);
      setStatus(result === 'saved' ? 'saved' : result === 'failed' ? 'failed' : null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fsl-pay-qr mx-auto flex w-full max-w-[360px] flex-col items-center gap-3 py-2">
      <div className="flex w-full max-w-[272px] aspect-square items-center justify-center rounded-2xl border border-border bg-card p-4 shadow-xs">
        {svg === '' ? (
          <Skeleton width={240} height={240} radius="lg" className="size-full max-w-[240px] max-h-[240px] aspect-square rounded-xl" />
        ) : (
          <img
            className="fsl-pay-qr__image block size-full max-w-[240px] aspect-square rounded-xl object-contain"
            alt={t('pay.qrAlt', { name: info.to.name, amount: formatVnd(info.amount) })}
            src={qrSrc(svg)}
          />
        )}
      </div>
      {summary && (
        <>
          <Amount value={info.amount} size="lg" />
          {(info.bank !== null || info.refCode) && (
            <div className="w-full overflow-hidden rounded-xl border border-border bg-card divide-y divide-border text-sm shadow-xs">
              {info.bank !== null && (
                <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2.5">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-xs text-muted-foreground">{info.bank.bankName}</span>
                    <p className="fsl-pay-qr__bank m-0 truncate font-semibold text-foreground text-left">
                      {`${info.bank.bankName} · ${info.bank.holderName}`}
                    </p>
                  </div>
                </div>
              )}
              {info.bank !== null && (
                <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2.5">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-xs text-muted-foreground">{t('pay.account')}</span>
                    <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                      {info.bank.accountNumberMasked}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => handleCopy('account', info.bank!.accountNumber)}
                    aria-label={t('pay.copyAccount')}
                    title={t('pay.copyAccount')}
                  >
                    <Icon name={copiedField === 'account' ? 'check' : 'copy'} size={14} />
                    <span>{copiedField === 'account' ? t('pay.copied') : t('share.copy')}</span>
                  </Button>
                </div>
              )}
              {info.refCode && (
                <div className="fsl-pay-qr__note flex min-h-11 items-center justify-between gap-3 px-4 py-2.5">
                  <div className="flex min-w-0 flex-col">
                    <span className="fsl-pay-qr__note-label text-xs text-muted-foreground">{t('pay.note')}</span>
                    <span className="fsl-pay-qr__memo w-fit rounded bg-warning-soft px-1.5 py-0.5 font-mono text-sm font-bold text-warning-foreground">
                      {info.refCode}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => handleCopy('note', info.refCode)}
                    aria-label={t('pay.copyNote')}
                    title={t('pay.copyNote')}
                  >
                    <Icon name={copiedField === 'note' ? 'check' : 'copy'} size={14} />
                    <span>{copiedField === 'note' ? t('pay.copied') : t('share.copy')}</span>
                  </Button>
                </div>
              )}
            </div>
          )}
          <span className="sr-only" role="status">
            {copiedField ? t('pay.copied') : ''}
          </span>
        </>
      )}
      <div className="fsl-pay-qr__actions flex w-full gap-2">
        {props.variant === 'receive' && (
          <Button variant="primary" block disabled={!svg} loading={busy} onClick={() => void share(props.shareText)}>
            {t('pay.share')}
          </Button>
        )}
        {props.variant === 'pay' && coarse && (
          <Button variant="primary" block disabled={!svg} onClick={() => setSheetOpen(true)}>
            {t('pay.openBankApp')}
          </Button>
        )}
        {/* A lone Save (the web pays by scanning the QR) is the primary action. */}
        <Button
          variant={props.variant === 'pay' && !coarse ? 'primary' : 'secondary'}
          block
          disabled={!svg}
          onClick={() => {
            if (isZaloWebView()) {
              showImage(() => qrPngBlob(svg));
              return;
            }
            void saveQr(svg, info.refCode);
          }}
        >
          {t('pay.saveQr')}
        </Button>
      </div>
      <p className="fsl-pay-qr__status m-0 text-center text-sm leading-snug text-muted-foreground empty:hidden" aria-live="polite">
        {status === 'saved' ? t('pay.shareSaved') : status === 'failed' ? t('pay.shareFailed') : null}
      </p>
      {imageSheet}
      {props.variant === 'pay' && coarse && <BankAppSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />}
    </div>
  );
}
