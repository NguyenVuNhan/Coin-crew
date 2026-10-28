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
import { cn } from '@/lib/utils';

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
      <div className="fsl-pay__sr sr-only" role="status" data-testid="pay-status">
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
        <div className="fsl-pay__loading flex flex-col gap-4 py-2">
          <Skeleton height={80} radius="lg" />
          <Skeleton
            width={240}
            height={240}
            radius="lg"
            className="fsl-pay__skeleton-qr mx-auto"
          />
          <div className="fsl-pay__skeleton-rows flex flex-col gap-2">
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
    <div className="fsl-pay__stopped flex justify-center">
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
          <p className="fsl-pay__hint m-0 text-sm text-muted-foreground text-center">{t('pay.mistake', { name })}</p>
        )}
      </>
    );
    content = (
      <>
        <section
          className={cn(
            'fsl-pay__card flex flex-col items-start gap-2 p-4 bg-card border border-border rounded-xl',
            `fsl-pay__card--${card.kind}`,
          )}
        >
          <div
            className={cn(
              'fsl-pay__card-icon size-11 rounded-full flex items-center justify-center shrink-0',
              card.kind === 'sent' ? 'bg-warning-soft text-warning-foreground' : 'bg-success-soft text-success',
            )}
          >
            <Icon name={card.kind === 'sent' ? 'clock' : 'circleCheck'} size={28} />
          </div>
          <p className="fsl-pay__card-title m-0 text-lg font-semibold text-foreground tabular-nums">
            {card.kind === 'sent'
              ? t('pay.sentTitle', { amount: formatVnd(card.amount) })
              : t('pay.paidTitle', { amount: formatVnd(card.amount), name })}
          </p>
          <p className="fsl-pay__card-body m-0 text-base text-muted-foreground">
            {card.kind === 'sent' ? t('pay.sentBody', { name }) : t('pay.paidBody')}
          </p>
          {card.kind === 'sent' && payInfo.refCode ? (
            <div className="fsl-pay__card-note flex items-center gap-2 flex-wrap">
              <span className="fsl-pay__row-label text-muted-foreground">{t('pay.note')}</span>{' '}
              <span className="fsl-pay__memo font-mono font-bold text-sm bg-warning-soft text-warning-foreground px-2 py-0.5 rounded-md [overflow-wrap:anywhere]">
                {payInfo.refCode}
              </span>
            </div>
          ) : null}
        </section>
        {payInfo.amount > 0 && (
          <div className="fsl-pay__owed flex flex-col gap-2 p-4 bg-card border border-border rounded-xl">
            <p className="m-0 font-medium text-foreground">{t('pay.stillOwed', { amount: formatVnd(payInfo.amount) })}</p>
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
      <div className="fsl-pay__empty flex flex-col items-center gap-4 py-6 text-center">
        <p className="fsl-pay__empty-text m-0 text-base text-muted-foreground">{t('pay.nothingOwed', { name })}</p>
        <Button href={`/t/${tripId}`} variant="secondary">
          {t('common.back')}
        </Button>
      </div>
    );
  } else if (payInfo.bankState !== 'ok' || !bank || !payInfo.payload) {
    content = (
      <>
        <div className="fsl-pay__hero flex flex-col items-center text-center gap-1">
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
        <p className="fsl-pay__hint m-0 text-sm text-muted-foreground text-center" aria-live="polite">
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
          <p className="fsl-pay__hint m-0 text-sm text-muted-foreground text-center">{t('pay.iPaidHint')}</p>
        </>
      );
    }
    content = (
      <div className="fsl-pay__layout grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-8 lg:items-start">
        <div className="fsl-pay__hero flex flex-col items-center text-center gap-1 lg:col-start-2 lg:row-start-1 lg:items-start lg:text-left">
          <Amount value={payInfo.amount} size="xl" />
          <p className="fsl-pay__to m-0 text-sm leading-snug text-muted-foreground [overflow-wrap:anywhere]">{t('pay.toLine', { holder: bank.holderName, bank: bank.bankName })}</p>
        </div>
        <div className="fsl-pay__qr lg:col-start-1 lg:row-start-1 lg:row-span-2 lg:min-w-0">
          <PayQr info={payInfo} variant="pay" summary={false} />
        </div>
        <div className="fsl-pay__body flex flex-col gap-3 min-w-0 lg:col-start-2 lg:row-start-2">
          <div className="fsl-pay__rows bg-card border border-border rounded-xl px-4 py-2 flex flex-col">
            <div className="fsl-pay__row flex justify-between items-center gap-3 min-h-11 text-sm">
              <span className="fsl-pay__row-label text-muted-foreground">{t('pay.account')}</span>
              <span className="fsl-pay__row-value text-foreground font-medium text-right flex items-center gap-1 min-w-0">
                <span className="fsl-pay__account-number tabular-nums">{bank.accountNumberMasked}</span>
                <button
                  type="button"
                  className="fsl-pay__icon-btn inline-flex items-center justify-center min-w-11 min-h-11 lg:min-w-9 lg:min-h-9 p-0 bg-transparent border-0 text-muted-foreground cursor-pointer rounded-md transition-colors hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                  aria-label={t('pay.copyAccount')}
                  title={t('pay.copyAccount')}
                  onClick={() => copy('account', bank.accountNumber)}
                >
                  <Icon name={copiedField === 'account' ? 'check' : 'copy'} size={16} />
                </button>
              </span>
            </div>
            <div className="fsl-pay__row flex justify-between items-center gap-3 min-h-11 text-sm border-t border-border">
              <span className="fsl-pay__row-label text-muted-foreground">{t('pay.note')}</span>
              <span className="fsl-pay__row-value text-foreground font-medium text-right flex items-center gap-1 min-w-0">
                <span className="fsl-pay__memo font-mono font-bold text-sm bg-warning-soft text-warning-foreground px-2 py-0.5 rounded-md [overflow-wrap:anywhere]">{payInfo.refCode}</span>
                <button
                  type="button"
                  className="fsl-pay__icon-btn inline-flex items-center justify-center min-w-11 min-h-11 lg:min-w-9 lg:min-h-9 p-0 bg-transparent border-0 text-muted-foreground cursor-pointer rounded-md transition-colors hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                  aria-label={t('pay.copyNote')}
                  title={t('pay.copyNote')}
                  onClick={() => copy('note', payInfo.refCode)}
                >
                  <Icon name={copiedField === 'note' ? 'check' : 'copy'} size={16} />
                </button>
              </span>
            </div>
            <span className="fsl-pay__sr sr-only" role="status">
              {copiedField ? t('pay.copied') : ''}
            </span>
          </div>
          <p className="fsl-pay__keep-note m-0 text-sm text-muted-foreground">{t('pay.keepNote')}</p>
          {!coarse && <p className="fsl-pay__scan-hint m-0 text-xs text-subtle-foreground">{t('pay.scanWithPhone')}</p>}
          {stoppedCheck}
          {wide && footer}
        </div>
      </div>
    );
  }

  // A failed "I've paid" grows the fixed bottom bar on a phone: leave room so the content can scroll clear of it.
  const barGrown = !wide && submitError !== null && footer !== null;
  const pageClass = cn(
    'fsl-pay flex flex-col gap-4 w-full',
    !isLayout && 'fsl-pay--narrow max-w-[480px] mx-auto',
    barGrown && 'fsl-pay--bar-error max-lg:pb-24',
  );

  return withStatus(
    <Screen
      title={t('pay.title', { name })}
      back={`/t/${tripId}`}
      wide
      bottomBar={wide ? undefined : (footer ?? undefined)}
    >
      <div className={pageClass}>
        {archived && <p className="fsl-pay__notice m-0 px-4 py-3 bg-muted rounded-xl text-muted-foreground">{t('settings.archived')}</p>}
        {content}
      </div>
    </Screen>,
  );
}
