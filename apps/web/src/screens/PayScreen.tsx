import { useState, useEffect, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import type { PayInfo } from '@fsl/core';
import { formatVnd } from '@fsl/core';
import { useT } from '../i18n';
import { apiFetch, apiSend } from '../api/client';
import { useTripView } from '../api/hooks';
import { remind } from '../lib/remind';
import { linkTokens } from '../lib/linkTokens';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { Amount } from '../components/Amount';
import { InlineError } from '../components/InlineError';
import { Skeleton } from '../components/Skeleton';
import { BankAppSheet } from '../components/BankAppSheet';
import './PayScreen.css';

function CopyIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function PayScreen() {
  const { tripId = '', toId = '' } = useParams<{ tripId: string; toId: string }>();
  const t = useT();
  const queryClient = useQueryClient();

  const {
    view,
    stopped,
    resume,
    refetch,
    error: viewError,
    isLoading: isViewLoading,
  } = useTripView(tripId, 5000, { stopAfterMs: 10 * 60_000 });

  const {
    data: payInfo,
    error: payError,
    isLoading: isPayLoading,
    refetch: refetchPay,
  } = useQuery({
    queryKey: ['pay', tripId, toId, view?.trip.version],
    queryFn: () => apiFetch<PayInfo>(`/api/trips/${tripId}/pay/${toId}`, { tripId }),
    enabled: !!view && !!tripId && !!toId,
  });

  const [svg, setSvg] = useState<string>('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [recordedStatus, setRecordedStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [copiedField, setCopiedField] = useState<'account' | 'note' | null>(null);

  useEffect(() => {
    if (!payInfo?.payload) {
      setSvg('');
      return;
    }
    let active = true;
    QRCode.toString(payInfo.payload, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
    })
      .then((res) => {
        if (active) setSvg(res);
      })
      .catch(() => {
        if (active) setSvg('');
      });
    return () => {
      active = false;
    };
  }, [payInfo?.payload]);

  const handleCopyAccount = () => {
    if (payInfo?.bank?.accountNumber && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard
        .writeText(payInfo.bank.accountNumber)
        .then(() => {
          setCopiedField('account');
          setTimeout(() => setCopiedField(null), 2000);
        })
        .catch(() => {});
    }
  };

  const handleCopyNote = () => {
    if (payInfo?.refCode && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard
        .writeText(payInfo.refCode)
        .then(() => {
          setCopiedField('note');
          setTimeout(() => setCopiedField(null), 2000);
        })
        .catch(() => {});
    }
  };

  const handleSaveQr = () => {
    try {
      if (!svg || typeof document === 'undefined') return;
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 1024, 1024);

      const img = new Image();
      img.onload = () => {
        try {
          ctx.drawImage(img, 0, 0, 1024, 1024);
          canvas.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const cleanRef = (payInfo?.refCode ?? 'qr').replace(/\s+/g, '-');
            a.download = `vietqr-${cleanRef}.png`;
            a.href = url;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }, 'image/png');
        } catch {
          // ignore
        }
      };
      img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    } catch {
      // on failure do nothing
    }
  };

  const handleAlreadyPaid = async () => {
    if (!tripId || !toId || !view?.me.participantId || !payInfo) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await apiSend<{ paymentId: string; status: string }>(
        `/api/trips/${tripId}/payments`,
        'POST',
        {
          fromId: view.me.participantId,
          toId,
          amount: payInfo.amount,
        },
        tripId,
      );
      setRecordedStatus(res.status);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
        queryClient.invalidateQueries({ queryKey: ['pay', tripId] }),
      ]);
    } catch (err) {
      setSubmitError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemind = () => {
    if (!view) return;
    const groupToken =
      view.links?.group ?? (tripId ? linkTokens.get(tripId) : null) ?? '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const link = `${origin}/j/${groupToken}`;
    const text = t('pay.remindBankText', {
      name: payInfo?.to.name ?? '',
      trip: view.trip.name,
      link,
    });
    void remind(text);
  };

  if (viewError || payError) {
    return (
      <Screen title="" back={tripId ? `/t/${tripId}` : undefined}>
        <InlineError
          error={viewError || payError}
          onRetry={() => {
            if (viewError) refetch();
            if (payError) refetchPay();
          }}
        />
      </Screen>
    );
  }

  if (isViewLoading || (isPayLoading && !payInfo) || !payInfo || !view) {
    return (
      <Screen title="" back={tripId ? `/t/${tripId}` : undefined}>
        <div className="fsl-pay__loading">
          <Skeleton height={80} radius="lg" />
          <Skeleton
            width={240}
            height={240}
            radius="lg"
            className="fsl-pay__skeleton-qr"
          />
          <div className="fsl-pay__skeleton-rows">
            <Skeleton height={20} radius="sm" />
            <Skeleton height={20} radius="sm" />
            <Skeleton height={20} radius="sm" />
            <Skeleton height={20} radius="sm" />
          </div>
        </div>
      </Screen>
    );
  }

  const name = payInfo.to.name;
  const hasInFlight = payInfo.inFlight.length > 0;

  if (payInfo.amount === 0 && !hasInFlight && !recordedStatus) {
    return (
      <Screen title={t('pay.title', { name })} back={`/t/${tripId}`}>
        <div className="fsl-pay__empty">
          <p className="fsl-pay__empty-text">{t('pay.nothingOwed', { name })}</p>
          <Button href={`/t/${tripId}`} variant="secondary">
            {t('common.back')}
          </Button>
        </div>
      </Screen>
    );
  }

  const hideAlreadyPaid =
    payInfo.amount === 0 || hasInFlight || recordedStatus !== null;

  let statusContent: ReactNode;
  if (recordedStatus === 'confirmed') {
    statusContent = (
      <div className="fsl-pay__status fsl-pay__status--confirmed">
        <span>{t('pay.paid')}</span>
      </div>
    );
  } else if (recordedStatus === 'says_paid' || hasInFlight) {
    statusContent = (
      <div className="fsl-pay__status fsl-pay__status--waiting-confirm">
        <span className="fsl-pay__status-dot" aria-hidden="true" />
        <span>{t('pay.waitingConfirm', { name })}</span>
      </div>
    );
  } else if (stopped) {
    statusContent = (
      <div className="fsl-pay__status fsl-pay__status--stopped">
        <Button
          variant="secondary"
          onClick={() => {
            resume();
            refetch();
            refetchPay();
          }}
        >
          {t('pay.tapToCheck')}
        </Button>
      </div>
    );
  } else {
    statusContent = (
      <div className="fsl-pay__status">
        <span className="fsl-pay__status-dot" aria-hidden="true" />
        <span>{t('pay.waiting', { name })}</span>
      </div>
    );
  }

  return (
    <Screen title={t('pay.title', { name })} back={`/t/${tripId}`}>
      <div className="fsl-pay">
        <div className="fsl-pay__hero">
          <div className="fsl-pay__hero-label">{t('pay.title', { name })}</div>
          <Amount value={payInfo.amount} size="xl" />
        </div>

        {payInfo.bankState === 'pending' && (
          <div className="fsl-pay__notice fsl-pay__notice--pending">
            {t('pay.bankPending', { name })}
          </div>
        )}

        {payInfo.bankState === 'none' && (
          <div className="fsl-pay__notice-stack">
            <div className="fsl-pay__notice fsl-pay__notice--none">
              {t('pay.bankNone', { name })}
            </div>
            <Button variant="secondary" block onClick={handleRemind}>
              {t('pay.remindThem', { name })}
            </Button>
          </div>
        )}

        {payInfo.bankState === 'ok' && (
          <>
            <div className="fsl-pay__qr-card">
              <div className="fsl-pay__qr-wrap">
                <img
                  className="fsl-pay__qr-image"
                  alt={t('pay.qrAlt', {
                    name,
                    amount: formatVnd(payInfo.amount),
                  })}
                  src={
                    svg ? 'data:image/svg+xml;utf8,' + encodeURIComponent(svg) : ''
                  }
                />
              </div>

              <div className="fsl-pay__details">
                <div className="fsl-pay__row">
                  <span className="fsl-pay__row-label">{t('pay.bank')}</span>
                  <span className="fsl-pay__row-value">
                    {payInfo.bank?.bankName}
                  </span>
                </div>

                <div className="fsl-pay__row">
                  <span className="fsl-pay__row-label">{t('pay.account')}</span>
                  <span className="fsl-pay__row-value fsl-pay__row-value--with-action">
                    <span>{payInfo.bank?.accountNumberMasked}</span>
                    <button
                      type="button"
                      className="fsl-pay__icon-btn"
                      aria-label={t('pay.copyAccount')}
                      onClick={handleCopyAccount}
                    >
                      {copiedField === 'account' ? <CheckIcon /> : <CopyIcon />}
                    </button>
                  </span>
                </div>

                <div className="fsl-pay__row">
                  <span className="fsl-pay__row-label">{t('pay.name')}</span>
                  <span className="fsl-pay__row-value">
                    {payInfo.bank?.holderName}
                  </span>
                </div>

                <div className="fsl-pay__row">
                  <span className="fsl-pay__row-label">{t('pay.amount')}</span>
                  <span className="fsl-pay__row-value">
                    {formatVnd(payInfo.amount)}
                  </span>
                </div>

                <div className="fsl-pay__row">
                  <span className="fsl-pay__row-label">{t('pay.note')}</span>
                  <span className="fsl-pay__row-value fsl-pay__row-value--with-action">
                    <span className="fsl-pay__memo">{payInfo.refCode}</span>
                    <button
                      type="button"
                      className="fsl-pay__icon-btn"
                      aria-label={t('pay.copyNote')}
                      onClick={handleCopyNote}
                    >
                      {copiedField === 'note' ? <CheckIcon /> : <CopyIcon />}
                    </button>
                  </span>
                </div>
              </div>
            </div>

            <p className="fsl-pay__keep-note">{t('pay.keepNote')}</p>
            <p className="fsl-pay__scan-hint">{t('pay.scanHint')}</p>

            <div className="fsl-pay__actions">
              <Button variant="primary" block onClick={() => setSheetOpen(true)}>
                {t('pay.openBankApp')}
              </Button>
              <Button variant="secondary" block onClick={handleSaveQr}>
                {t('pay.saveQr')}
              </Button>
            </div>

            <div className="fsl-pay__status-block" aria-live="polite">
              {statusContent}
            </div>

            {!hideAlreadyPaid && (
              <div className="fsl-pay__already-paid-wrap">
                <Button
                  variant="ghost"
                  className="fsl-pay__already-paid"
                  onClick={handleAlreadyPaid}
                  loading={isSubmitting}
                >
                  {t('pay.alreadyPaid')}
                </Button>
              </div>
            )}

            {submitError !== null && (
              <InlineError error={submitError} onRetry={handleAlreadyPaid} />
            )}

            <BankAppSheet
              open={sheetOpen}
              onClose={() => setSheetOpen(false)}
            />
          </>
        )}
      </div>
    </Screen>
  );
}
