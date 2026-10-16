import { useState, useRef, useEffect, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { formatVnd, type PayInfo, type TripView } from '@fsl/core';
import { useT } from '../i18n';
import { apiSend } from '../api/client';
import { useTripView } from '../api/hooks';
import { canManageBankOf } from '../lib/rowActions';
import { usePayInfo } from '../api/payInfo';
import { groupLink, remind } from '../lib/remind';
import { useIsWide, useIsCoarsePointer } from '../lib/media';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { Amount } from '../components/Amount';
import { EmptyState } from '../components/EmptyState';
import { InlineError } from '../components/InlineError';
import { Skeleton } from '../components/Skeleton';
import { PayQr } from '../components/PayQr';
import { Icon } from '../components/icons';
import './PayScreen.css';

type Recorded = { id: string; amount: number; status: string };
type StatusCard = { kind: 'sent' | 'paid'; amount: number } | null;

/**
 * What the status card shows. A payment recorded here follows its live status in the trip view (the member confirming
 * turns "sent" into "paid"); one that was already on its way when the page opened shows as sent.
 */
function statusCardFor(recorded: Recorded | null, view: TripView, payInfo: PayInfo): StatusCard {
  const live = recorded ? view.payments.find((p) => p.id === recorded.id) : undefined;
  const status = recorded ? (live?.status ?? recorded.status) : null;
  if (recorded && status === 'confirmed') return { kind: 'paid', amount: live?.amountConfirmed ?? recorded.amount };
  if (recorded && status === 'says_paid') return { kind: 'sent', amount: live?.amountClaimed ?? recorded.amount };
  if (payInfo.inFlight.length > 0) {
    return { kind: 'sent', amount: payInfo.inFlight.reduce((sum, p) => sum + p.amountClaimed, 0) };
  }
  return null;
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
  } = usePayInfo({
    tripId,
    toId,
    enabled: !!view && !!tripId && !!toId,
    version: view?.trip.version ?? 0,
  });

  const wide = useIsWide();
  const coarse = useIsCoarsePointer();
  const [recorded, setRecorded] = useState<Recorded | null>(null);
  const [restOpen, setRestOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [copiedField, setCopiedField] = useState<'account' | 'note' | null>(null);
  const [remindCopied, setRemindCopied] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const copy = (field: 'account' | 'note', text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
          setCopiedField(field);
          copyTimerRef.current = setTimeout(() => {
            setCopiedField(null);
            copyTimerRef.current = null;
          }, 2000);
        })
        .catch(() => {});
    }
  };

  const name = payInfo?.to.name ?? '';
  const card = view && payInfo ? statusCardFor(recorded, view, payInfo) : null;
  // The status card as one sentence for the live region ('' while the QR or something else is on screen).
  let statusText = '';
  if (card && !restOpen) {
    statusText =
      card.kind === 'sent'
        ? `${t('pay.sentTitle', { amount: formatVnd(card.amount) })}. ${t('pay.sentBody', { name })}`
        : `${t('pay.paidTitle', { amount: formatVnd(card.amount), name })}. ${t('pay.paidBody')}`;
  }
  // Updated only once the data is there: the region outlives the loading state a trip refetch passes through, and
  // clearing it there would announce the same status again afterwards.
  const loaded = !!view && !!payInfo;
  useEffect(() => {
    if (loaded) setAnnouncement(statusText);
  }, [loaded, statusText]);
  // Always rendered, next to whichever screen is showing, so screen readers see its text change.
  const withStatus = (screen: ReactNode) => (
    <>
      {screen}
      <div className="fsl-pay__sr" role="status" data-testid="pay-status">
        {announcement}
      </div>
    </>
  );

  const handleIPaid = async () => {
    if (!tripId || !toId || !view?.me.participantId || !payInfo) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const amount = payInfo.amount;
      const res = await apiSend<{ paymentId: string; status: string }>(
        `/api/trips/${tripId}/payments`,
        'POST',
        { fromId: view.me.participantId, toId, amount },
        tripId,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
        queryClient.invalidateQueries({ queryKey: ['pay', tripId] }),
      ]);
      setRecorded({ id: res.paymentId, amount, status: res.status });
      setRestOpen(false);
    } catch (err) {
      setSubmitError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemind = () => {
    if (!view) return;
    const text = t('pay.remindBankText', {
      name: payInfo?.to.name ?? '',
      trip: view.trip.name,
      link: groupLink(view),
    });
    void remind(text).then((r) => setRemindCopied(r === 'copied'));
  };

  if (viewError || payError) {
    return withStatus(
      <Screen title="" back={tripId ? `/t/${tripId}` : undefined}>
        <InlineError
          error={viewError || payError}
          onRetry={() => {
            if (viewError) refetch();
            if (payError) refetchPay();
          }}
        />
      </Screen>,
    );
  }

  if (isViewLoading || (isPayLoading && !payInfo) || !payInfo || !view) {
    return withStatus(
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
      </Screen>,
    );
  }

  const archived = view.trip.archived;
  const bank = payInfo.bank;
  const stoppedCheck = stopped ? (
    <div className="fsl-pay__stopped">
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
  ) : null;

  let footer: ReactNode = null;
  let content: ReactNode = null;
  // Only the QR view uses the two columns; the other views stay a phone-width column on a wide screen.
  let isLayout = false;

  if (card !== null && !restOpen) {
    footer = (
      <>
        <Button href={`/t/${tripId}`} variant="primary" block>
          {t('details.backToTrip')}
        </Button>
        {card.kind === 'sent' && (
          <p className="fsl-pay__hint">{t('pay.mistake', { name })}</p>
        )}
      </>
    );
    content = (
      <>
        <section className={`fsl-pay__card fsl-pay__card--${card.kind}`}>
          <div className="fsl-pay__card-icon">
            <Icon name={card.kind === 'sent' ? 'clock' : 'circleCheck'} size={28} />
          </div>
          <p className="fsl-pay__card-title">
            {card.kind === 'sent'
              ? t('pay.sentTitle', { amount: formatVnd(card.amount) })
              : t('pay.paidTitle', { amount: formatVnd(card.amount), name })}
          </p>
          <p className="fsl-pay__card-body">
            {card.kind === 'sent' ? t('pay.sentBody', { name }) : t('pay.paidBody')}
          </p>
          {card.kind === 'sent' && payInfo.refCode ? (
            <div className="fsl-pay__card-note">
              <span className="fsl-pay__row-label">{t('pay.note')}</span>{' '}
              <span className="fsl-pay__memo">{payInfo.refCode}</span>
            </div>
          ) : null}
        </section>
        {payInfo.amount > 0 && (
          <div className="fsl-pay__owed">
            <p>{t('pay.stillOwed', { amount: formatVnd(payInfo.amount) })}</p>
            <Button variant="secondary" onClick={() => setRestOpen(true)}>
              {t('pay.showQrRest')}
            </Button>
          </div>
        )}
        {stoppedCheck}
        {wide && footer}
      </>
    );
  } else if (payInfo.amount === 0) {
    content = (
      <div className="fsl-pay__empty">
        <p className="fsl-pay__empty-text">{t('pay.nothingOwed', { name })}</p>
        <Button href={`/t/${tripId}`} variant="secondary">
          {t('common.back')}
        </Button>
      </div>
    );
  } else if (payInfo.bankState !== 'ok' || !bank || !payInfo.payload) {
    content = (
      <>
        <div className="fsl-pay__hero">
          <Amount value={payInfo.amount} size="xl" />
        </div>
        <EmptyState
          icon="bank"
          title={payInfo.bankState === 'pending' ? t('pay.bankPending', { name }) : t('pay.bankNone', { name })}
          // Not for "waiting for approval": they did add them.
          body={payInfo.bankState === 'none' ? t('pay.bankAskThem') : undefined}
          action={
            <>
              <Button variant="secondary" block onClick={handleRemind}>
                {t('pay.remindThem', { name })}
              </Button>
              {payInfo.bankState === 'none' && view && canManageBankOf(view, payInfo.to.id) && (
                <Button href={`/t/${tripId}/people/${payInfo.to.id}/bank`} variant="secondary" block>
                  {t('transfers.addFor', { name })}
                </Button>
              )}
            </>
          }
        />
        <p className="fsl-pay__hint" aria-live="polite">
          {remindCopied ? t('whoPays.remindCopied') : null}
        </p>
      </>
    );
  } else {
    isLayout = true;
    if (!archived) {
      // The error sits above the button, in the same place: on a phone that is the fixed bottom bar.
      footer = (
        <>
          {submitError !== null && <InlineError error={submitError} onRetry={handleIPaid} />}
          <Button variant="secondary" block loading={isSubmitting} onClick={handleIPaid}>
            {t('pay.iPaid')}
          </Button>
          <p className="fsl-pay__hint">{t('pay.iPaidHint')}</p>
        </>
      );
    }
    content = (
      <div className="fsl-pay__layout">
        <div className="fsl-pay__hero">
          <Amount value={payInfo.amount} size="xl" />
          <p className="fsl-pay__to">{t('pay.toLine', { holder: bank.holderName, bank: bank.bankName })}</p>
        </div>
        <div className="fsl-pay__qr">
          <PayQr info={payInfo} variant="pay" summary={false} />
        </div>
        <div className="fsl-pay__body">
          <div className="fsl-pay__rows">
            <div className="fsl-pay__row">
              <span className="fsl-pay__row-label">{t('pay.account')}</span>
              <span className="fsl-pay__row-value">
                <span className="fsl-pay__account-number">{bank.accountNumberMasked}</span>
                <button
                  type="button"
                  className="fsl-pay__icon-btn"
                  aria-label={t('pay.copyAccount')}
                  title={t('pay.copyAccount')}
                  onClick={() => copy('account', bank.accountNumber)}
                >
                  <Icon name={copiedField === 'account' ? 'check' : 'copy'} size={16} />
                </button>
              </span>
            </div>
            <div className="fsl-pay__row">
              <span className="fsl-pay__row-label">{t('pay.note')}</span>
              <span className="fsl-pay__row-value">
                <span className="fsl-pay__memo">{payInfo.refCode}</span>
                <button
                  type="button"
                  className="fsl-pay__icon-btn"
                  aria-label={t('pay.copyNote')}
                  title={t('pay.copyNote')}
                  onClick={() => copy('note', payInfo.refCode)}
                >
                  <Icon name={copiedField === 'note' ? 'check' : 'copy'} size={16} />
                </button>
              </span>
            </div>
            <span className="fsl-pay__sr" role="status">
              {copiedField ? t('pay.copied') : ''}
            </span>
          </div>
          <p className="fsl-pay__keep-note">{t('pay.keepNote')}</p>
          {!coarse && <p className="fsl-pay__scan-hint">{t('pay.scanWithPhone')}</p>}
          {stoppedCheck}
          {wide && footer}
        </div>
      </div>
    );
  }

  // A failed "I've paid" grows the fixed bottom bar on a phone: leave room so the content can scroll clear of it.
  const barGrown = !wide && submitError !== null && footer !== null;
  const pageClass = ['fsl-pay', isLayout ? '' : 'fsl-pay--narrow', barGrown ? 'fsl-pay--bar-error' : '']
    .filter(Boolean)
    .join(' ');

  return withStatus(
    <Screen
      title={t('pay.title', { name })}
      back={`/t/${tripId}`}
      wide
      bottomBar={wide ? undefined : (footer ?? undefined)}
    >
      <div className={pageClass}>
        {archived && <p className="fsl-pay__notice">{t('settings.archived')}</p>}
        {content}
      </div>
    </Screen>,
  );
}
