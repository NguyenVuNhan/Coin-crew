import { useState, type JSX } from 'react';
import { formatVnd, type PayInfo } from '@fsl/core';
import { useT } from '../i18n';
import { qrPngBlob, qrSrc, saveQr, shareQr, useQrSvg } from '../lib/qr';
import { isZaloWebView } from '../lib/zaloEnv';
import { useIsCoarsePointer } from '../lib/media';
import { Skeleton } from './Skeleton';
import { Amount } from './Amount';
import { Button } from './Button';
import { BankAppSheet } from './BankAppSheet';
import { useImageSheet } from './SaveImageSheet';

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
  const { sheet: imageSheet, show: showImage } = useImageSheet();

  if (info.amount === 0 || info.payload === null) {
    return null;
  }

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
          {info.bank !== null && (
            <p className="fsl-pay-qr__bank m-0 text-center text-sm text-muted-foreground">{`${info.bank.bankName} · ${info.bank.holderName}`}</p>
          )}
          <div className="fsl-pay-qr__note flex items-center justify-center gap-2 text-sm">
            <span className="fsl-pay-qr__note-label text-muted-foreground">{t('pay.note')}</span>
            <span className="fsl-pay-qr__memo rounded bg-warning-soft px-1.5 py-0.5 font-mono font-bold text-warning-foreground">{info.refCode}</span>
          </div>
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
