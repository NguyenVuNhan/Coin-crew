import { useState, type JSX } from 'react';
import { formatVnd, type PayInfo } from '@fsl/core';
import { useT } from '../i18n';
import { qrSrc, saveQr, shareQr, useQrSvg } from '../lib/qr';
import { useIsCoarsePointer } from '../lib/media';
import { Skeleton } from './Skeleton';
import { Amount } from './Amount';
import { Button } from './Button';
import { BankAppSheet } from './BankAppSheet';
import './PayQr.css';

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

  if (info.amount === 0 || info.payload === null) {
    return null;
  }

  async function share(text: string) {
    setBusy(true);
    try {
      const result = await shareQr(svg, text, info.refCode);
      setStatus(result === 'saved' ? 'saved' : result === 'failed' ? 'failed' : null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fsl-pay-qr">
      {svg === '' ? (
        <Skeleton width={240} height={240} radius="lg" />
      ) : (
        <img
          className="fsl-pay-qr__image"
          alt={t('pay.qrAlt', { name: info.to.name, amount: formatVnd(info.amount) })}
          src={qrSrc(svg)}
        />
      )}
      {summary && (
        <>
          <Amount value={info.amount} size="lg" />
          {info.bank !== null && (
            <p className="fsl-pay-qr__bank">{`${info.bank.bankName} · ${info.bank.holderName}`}</p>
          )}
          <div className="fsl-pay-qr__note">
            <span className="fsl-pay-qr__note-label">{t('pay.note')}</span>
            <span className="fsl-pay-qr__memo">{info.refCode}</span>
          </div>
        </>
      )}
      <div className="fsl-pay-qr__actions">
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
          onClick={() => void saveQr(svg, info.refCode)}
        >
          {t('pay.saveQr')}
        </Button>
      </div>
      <p className="fsl-pay-qr__status" aria-live="polite">
        {status === 'saved' ? t('pay.shareSaved') : status === 'failed' ? t('pay.shareFailed') : null}
      </p>
      {props.variant === 'pay' && coarse && <BankAppSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />}
    </div>
  );
}
