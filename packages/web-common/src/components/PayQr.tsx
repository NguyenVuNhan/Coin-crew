import { useState, type JSX } from 'react';
import { ArrowLeftRight, Download } from 'lucide-react';
import { formatVnd, type BankApp, type PayInfo } from '@cc/core';
import { useT } from '../i18n';
import { qrPngBlob, qrSrc, shareQr, useQrSvg } from '../lib/qr';
import { isZaloWebView } from '../lib/zaloEnv';
import { useIsCoarsePointer } from '../lib/media';
import { bankAppLogo, deviceBankApps, useRememberedBankApp } from '../lib/bankApps';
import { usePlatform } from '../platform';
import { isIosDevice } from '../platform/browser';
import { Skeleton } from './Skeleton';
import { Amount } from './Amount';
import { Button } from './Button';
import { BankPickerSheet } from './BankPickerSheet';
import { BankHandoffSheet } from './BankHandoffSheet';
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
  const platform = usePlatform();
  const svg = useQrSvg(info.payload);
  const coarse = useIsCoarsePointer();
  const { app: bankApp, remember } = useRememberedBankApp();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [handoffApp, setHandoffApp] = useState<BankApp | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'saved' | 'failed' | 'gallery' | null>(null);
  const { sheet: imageSheet, show: showImage } = useImageSheet();

  if (info.amount === 0 || info.payload === null) {
    return null;
  }

  const fileName = `vietqr-${(info.refCode || 'qr').replace(/\s+/g, '-')}.png`;
  const makePng = () => qrPngBlob(svg);
  const showBankButton = props.variant === 'pay' && coarse;

  /** iPhone without file sharing: offer the long-press picture instead. True when it is showing. */
  function saveFailed(): boolean {
    if (platform.kind === 'web' && isIosDevice()) {
      showImage(makePng);
      return true;
    }
    return false;
  }

  async function download() {
    setSaving(true);
    try {
      const blob = await makePng();
      const r = blob ? await platform.saveImage(blob, fileName) : 'failed';
      if (r === 'saved') {
        setStatus('gallery');
      } else if (r === 'failed') {
        setStatus('failed');
        saveFailed();
      } else {
        setStatus(null);
      }
    } catch {
      setStatus('failed');
    } finally {
      setSaving(false);
    }
  }

  async function share(text: string) {
    if (platform.kind === 'zmp') {
      setBusy(true);
      try {
        await download();
      } finally {
        setBusy(false);
      }
      return;
    }
    if (isZaloWebView()) {
      showImage(makePng, text);
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

  function pick(app: BankApp) {
    remember(app);
    setPickerOpen(false);
    setHandoffApp(app);
  }

  const bankLogo = bankApp ? bankAppLogo(bankApp.appId) : undefined;

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
      <div className={`fsl-pay-qr__actions flex w-full gap-2 ${showBankButton ? 'flex-col' : ''}`}>
        {props.variant === 'receive' && (
          <Button variant="primary" block className="flex-1 min-w-0" disabled={!svg} loading={busy} onClick={() => void share(props.shareText)}>
            {t('pay.share')}
          </Button>
        )}
        {showBankButton && (
          <div className="fsl-bank-open flex w-full gap-2">
            {bankApp ? (
              <>
                <Button variant="primary" block className="flex-1 min-w-0" disabled={!svg} onClick={() => setHandoffApp(bankApp)}>
                  {bankLogo && <img alt="" src={bankLogo} className="size-6 rounded-md" />}
                  <span className="truncate">{t('pay.openApp', { app: bankApp.appName })}</span>
                </Button>
                <Button
                  variant="secondary"
                  className="fsl-bank-switch size-11 shrink-0 p-0"
                  aria-label={t('pay.switchBank')}
                  title={t('pay.switchBank')}
                  onClick={() => setPickerOpen(true)}
                >
                  <ArrowLeftRight className="size-5" aria-hidden="true" />
                </Button>
              </>
            ) : (
              <Button variant="primary" block disabled={!svg} onClick={() => setPickerOpen(true)}>
                {t('pay.openBankApp')}
              </Button>
            )}
          </div>
        )}
        {/* A lone Download (the web pays by scanning the QR) is the primary action. */}
        <Button
          variant={props.variant === 'pay' && !coarse ? 'primary' : 'secondary'}
          block
          className="flex-1 min-w-0"
          disabled={!svg}
          loading={saving}
          onClick={() => void download()}
        >
          <Download className="size-5" aria-hidden="true" />
          <span className="truncate">{t('pay.downloadQr')}</span>
        </Button>
      </div>
      <p className="fsl-pay-qr__status m-0 text-center text-sm leading-snug text-muted-foreground empty:hidden" aria-live="polite">
        {status === 'saved' ? t('pay.shareSaved') : status === 'gallery' ? t('pay.savedToGallery') : status === 'failed' ? t('pay.shareFailed') : null}
      </p>
      {imageSheet}
      {showBankButton && (
        <BankPickerSheet
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          apps={deviceBankApps()}
          recent={bankApp}
          onPick={pick}
        />
      )}
      {showBankButton && handoffApp && (
        <BankHandoffSheet
          open={handoffApp !== null}
          onClose={() => setHandoffApp(null)}
          app={handoffApp}
          makePng={makePng}
          fileName={fileName}
          onSaveFailed={saveFailed}
        />
      )}
    </div>
  );
}
