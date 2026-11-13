import { useState, useRef, useEffect, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { formatVnd, pairHistory, type PayInfo, type TripView } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { apiSend, ApiClientError } from '@cc/web-data-access/client';
import { newIdempotencyKey } from '@cc/web-data-access/people';
import { useTripView } from '@cc/web-data-access/hooks';
import { useTrip } from '../lib/tripBase';
import { useBackLink } from '../lib/navHistory';
import { canManageBankOf } from '../lib/rowActions';
import { usePayInfo } from '@cc/web-data-access/payInfo';
import { groupLink, remind } from '../lib/remind';
import { useIsWide } from '@cc/web-util/media';
import { Screen } from '../components/Screen';
import { GuestSignIn } from '../components/GuestGate';
import { Button } from '@cc/web-ui/components/Button';
import { Amount } from '@cc/web-ui/components/Amount';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Skeleton } from '@cc/web-ui/components/Skeleton';
import { PayDetails } from '../components/PayDetails';
import { CoversButton } from '../components/CoversButton';
import { HistoryList } from '../components/HistoryList';
import { Icon } from '@cc/web-ui/components/icons';
import { usePlatform } from '@cc/web-platform';
import { remindCard } from '../lib/shareCards';
import { cn } from '@cc/web-ui/lib/utils';

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

/**
 * "What this covers" on the group pay page: the two-way lines between the viewer and the person they pay, in this group
 * only (owner, 2026-11-13). Built from the trip view the page already has, like the request page's ledger.
 */
function PayCovers({ view, toId, name }: { view: TripView; toId: string; name: string }) {
  const t = useT();
  const me = view.me.participantId;
  if (!me) return null;
  const history = pairHistory({
    tripId: view.trip.id,
    ownerPid: toId,
    otherPid: me,
    expenses: view.expenses,
    payments: view.payments,
    suggestions: view.suggestions,
    roundTransfers: Boolean(view.trip.roundTransfers),
  });
  if (history.lines.length === 0) return null;
  const gap = history.gap;
  const viaName = gap?.kind === 'reroute' && gap.viaPid ? (view.people.find((p) => p.id === gap.viaPid)?.name ?? null) : null;
  return (
    <CoversButton label={t('pay.covers')} title={view.trip.name} testId="pay-covers">
      <HistoryList
        lines={history.lines}
        otherName={name}
        perspective="other"
        summary={gap ? { twoWay: history.twoWay, suggested: history.suggested, gap, viaName } : undefined}
      />
    </CoversButton>
  );
}

export function PayScreen() {
  const { tripId, href } = useTrip();
  const back = useBackLink(href());
  const { toId = '' } = useParams<{ toId: string }>();
  const [searchParams] = useSearchParams();
  const t = useT();
  const queryClient = useQueryClient();
  const platform = usePlatform();

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
  const [recorded, setRecorded] = useState<Recorded | null>(null);
  const [restOpen, setRestOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [remindCopied, setRemindCopied] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  /** The idempotency key of the unfinished "I've paid" attempt, with the amount it was made for. */
  const payKey = useRef<{ key: string; amount: number } | null>(null);

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
      // Created on the first tap and kept across retries after an error, so the server records the payment once.
      // A retry for a different amount is a different payment: the server would refuse the old key with it.
      if (payKey.current?.amount !== amount) payKey.current = { key: newIdempotencyKey(), amount };
      const res = await apiSend<{ paymentId: string; status: string }>(
        `/api/trips/${tripId}/payments`,
        'POST',
        { fromId: view.me.participantId, toId, amount, idempotencyKey: payKey.current.key },
        tripId,
      );
      payKey.current = null;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
        queryClient.invalidateQueries({ queryKey: ['pay', tripId] }),
      ]);
      setRecorded({ id: res.paymentId, amount, status: res.status });
      setRestOpen(false);
    } catch (err) {
      // The key was already used for another body: retrying it can only fail again.
      if (err instanceof ApiClientError && err.code === 'CONFLICT') payKey.current = null;
      setSubmitError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemind = async () => {
    if (!view) return;
    const text = t('pay.remindBankText', {
      name: payInfo?.to.name ?? '',
      trip: view.trip.name,
      link: groupLink(view),
    });
    if (platform.kind === 'zmp') {
      const r = await platform.share(remindCard(view, text, platform.apiBase));
      if (r === 'copied') {
        setRemindCopied(true);
      }
      return;
    }
    void remind(text).then((r) => setRemindCopied(r === 'copied'));
  };

  if (viewError || payError) {
    return withStatus(
      <Screen title="" back={tripId ? href() : undefined}>
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
      <Screen title="" back={tripId ? href() : undefined}>
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
  const guest = view.me.kind === 'guest';
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
        <Button href={back.to} onClick={back.onClick} variant="primary" block>
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
              <span className="fsl-pay__memo font-mono font-bold text-sm bg-secondary text-secondary-foreground px-2 py-0.5 rounded-md [overflow-wrap:anywhere]">
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
        <Button href={back.to} onClick={back.onClick} variant="secondary">
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
                <Button href={href(`/people/${payInfo.to.id}/bank`)} variant="secondary" block>
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
      <PayDetails
        info={payInfo}
        bank={bank}
        wide={wide}
        footer={footer}
        extras={
          <>
            <PayCovers view={view} toId={toId} name={name} />
            {stoppedCheck}
          </>
        }
        // A guest's sign-in sits with the details (the right-hand column on a wide screen), after "I've paid".
        after={guest ? <GuestSignIn pending={Boolean(view.me.hasPendingMembershipRequest)} /> : undefined}
        hero={
          <div className="fsl-pay__hero flex flex-col items-center text-center gap-1 lg:col-start-2 lg:row-start-1 lg:items-start lg:text-left">
            <Amount value={payInfo.amount} size="xl" />
            <p className="fsl-pay__to m-0 text-sm leading-snug text-muted-foreground [overflow-wrap:anywhere]">{t('pay.toLine', { holder: bank.holderName, bank: bank.bankName })}</p>
          </div>
        }
      />
    );
  }

  const pageClass = cn(
    'fsl-pay flex flex-col gap-4 w-full',
    !isLayout && 'fsl-pay--narrow max-w-[480px] mx-auto',
  );

  return withStatus(
    <Screen
      title={t('pay.title', { name })}
      // A guest only has their pay pages: back is the name picker.
      back={guest ? href('/who') : href()}
      wide
      bottomBar={wide ? undefined : (footer ?? undefined)}
    >
      <div className={pageClass}>
        {archived && <p className="fsl-pay__notice m-0 px-4 py-3 bg-muted rounded-xl text-muted-foreground">{t('settings.archived')}</p>}
        {content}
        {guest ? (
          !isLayout && <GuestSignIn pending={Boolean(view.me.hasPendingMembershipRequest)} />
        ) : (
          searchParams.get('via') === 'owe' && (
            <Button variant="ghost" href={href()} className="fsl-pay__see-group">
              {t('owe.seeGroup')}
            </Button>
          )
        )}
      </div>
    </Screen>,
  );
}
