import { useState, type JSX } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { HistoryPlace, PersonItem, RequestItem, RequestView } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { ApiClientError, apiFetch, apiSend } from '@cc/web-data-access/client';
import { newIdempotencyKey } from '@cc/web-data-access/people';
import { Screen } from '../components/Screen';
import { Button } from '@cc/web-ui/components/Button';
import { Amount } from '@cc/web-ui/components/Amount';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { PayDetails } from '../components/PayDetails';
import { useIsWide } from '@cc/web-util/media';
import { PersonLedger, toLedgerPlaces, type LedgerPlace } from '../components/PersonLedger';
import { cn } from '@cc/web-ui/lib/utils';

function getItemLabel(item: PersonItem, owner: string, t: ReturnType<typeof useT>): string {
  return item.kind === 'direct' ? t('request.quickExpenses', { owner }) : item.tripName;
}

/** A /r item as the ledger's input: same amount (owner's view), its lines and its gap. */
function toHistoryPlace(item: RequestItem): HistoryPlace {
  const lines = item.lines ?? [];
  const twoWay = lines
    .filter((l) => l.state === 'counted' || l.state === 'waiting')
    .reduce((sum, l) => sum + l.effect, 0);
  return {
    tripId: item.tripId,
    tripName: item.tripName,
    kind: item.kind,
    source: item.kind === 'direct' ? 'own' : 'group',
    amount: item.amount,
    history: { lines, twoWay, suggested: item.amount, gap: item.gap ?? null, trimmed: false },
  };
}

/** Full-width "What this covers (n)" opening the ledger in a sheet, like the pay screen's "View the bill". */
function CoversButton({ places, owner }: { places: LedgerPlace[]; owner: string }): JSX.Element | null {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (places.length === 0) return null;
  return (
    <>
      <Button
        variant="secondary"
        block
        className="fsl-request__covers"
        onClick={() => setOpen(true)}
        data-testid="request-covers"
      >
        {t('request.covers', { count: places.length })}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('history.title')}>
        <PersonLedger places={places} otherName={owner} perspective="other" open="inline" />
      </Sheet>
    </>
  );
}

export function RequestPage(): JSX.Element {
  const { token = '' } = useParams<{ token: string }>();
  const wide = useIsWide();
  const t = useT();

  const {
    data: view,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['request', token],
    queryFn: () => apiFetch<RequestView>(`/api/r/${encodeURIComponent(token)}`),
    enabled: Boolean(token),
  });

  const [hasPaid, setHasPaid] = useState(false);
  // One key per page load, reused on every retry: the server records the payment once.
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [isSending, setIsSending] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);

  if (isLoading) {
    return (
      <Screen title={t('request.title')}>
        <div className="fsl-request flex flex-col gap-4 py-4">
          <SkeletonList />
        </div>
      </Screen>
    );
  }

  if (error) {
    const isNotFound =
      (error instanceof ApiClientError && (error.status === 404 || error.code === 'NOT_FOUND')) ||
      (typeof error === 'object' &&
        error !== null &&
        (('status' in error && (error as { status: unknown }).status === 404) ||
          ('code' in error && (error as { code: unknown }).code === 'NOT_FOUND')));

    if (isNotFound) {
      return (
        <Screen title={t('request.title')}>
          <div className="fsl-request flex flex-col gap-4 py-4">
            <EmptyState icon="link" title={t('request.notFound')} action={null} />
          </div>
        </Screen>
      );
    }

    return (
      <Screen title={t('request.title')}>
        <div className="fsl-request flex flex-col gap-4 py-4">
          <InlineError error={error} onRetry={() => refetch()} />
        </div>
      </Screen>
    );
  }

  if (!view) {
    return (
      <Screen title={t('request.title')}>
        <div className="fsl-request flex flex-col gap-4 py-4">
          <SkeletonList />
        </div>
      </Screen>
    );
  }

  const owner = view.ownerName;
  const isWaiting = view.settlementWaiting || hasPaid;
  const places = toLedgerPlaces(view.items.map(toHistoryPlace), {
    quickExpenses: t('request.quickExpenses', { owner }),
  });

  const handlePaid = async () => {
    if (!token || !view || isSending) return;
    setIsSending(true);
    setSubmitError(null);

    const maxRetries = 3;
    let attempt = 0;

    while (true) {
      try {
        await apiSend(`/api/r/${encodeURIComponent(token)}/paid`, 'POST', {
          amount: view.total,
          idempotencyKey,
        });
        setHasPaid(true);
        void refetch();
        break;
      } catch (err: unknown) {
        const code =
          err instanceof ApiClientError
            ? err.code
            : (err as { code?: string })?.code;

        if (code === 'ALREADY_WAITING') {
          setHasPaid(true);
          void refetch();
          break;
        }

        if (code === 'TRY_AGAIN' && attempt < maxRetries) {
          attempt++;
          await new Promise((resolve) => setTimeout(resolve, 700));
          continue;
        }

        setSubmitError(err);
        break;
      }
    }

    setIsSending(false);
  };

  if (view.settled || (view.total === 0 && !isWaiting)) {
    return (
      <Screen title={t('request.title')}>
        <div className="fsl-request flex flex-col gap-4 py-4">
          <div className="fsl-request__settled bg-card border border-border rounded-xl p-4 text-center">
            <p className="m-0 text-base font-semibold text-foreground">
              {t('request.settled', { owner })}
            </p>
          </div>
        </div>
      </Screen>
    );
  }

  // Their "I've paid" already counts, so the total is often 0 by now: say only that it waits.
  if (isWaiting && view.total <= 0) {
    return (
      <Screen title={t('request.title')}>
        <div className="fsl-request flex flex-col gap-4 py-4">
          <div
            className="fsl-request__waiting bg-card border border-border rounded-xl p-4 text-center"
            data-testid="request-waiting"
          >
            <p className="m-0 text-base font-semibold text-foreground">
              {t('request.waiting', { owner })}
            </p>
          </div>
        </div>
      </Screen>
    );
  }

  if (view.total < 0) {
    return (
      <Screen title={t('request.title')}>
        <div className="fsl-request flex flex-col gap-4 py-4">
          <div className="flex flex-col items-center text-center gap-1">
            <h2 className="m-0 text-base font-medium text-muted-foreground">
              {t('request.ownerOwes', { owner })}
            </h2>
            <Amount value={-view.total} size="xl" tone="success" />
          </div>
          <CoversButton places={places} owner={owner} />
        </div>
      </Screen>
    );
  }

  // The group pay page's layout (PayScreen): the hero, the QR or the no-bank card, then "I've paid".
  const hasQr = !isWaiting && Boolean(view.pay?.payload);
  const bank = view.pay?.bank ?? null;
  const toLine =
    hasQr && bank ? (
      <p className="fsl-pay__to m-0 text-sm leading-snug text-muted-foreground [overflow-wrap:anywhere]">
        {t('pay.toLine', { holder: bank.holderName, bank: bank.bankName })}
      </p>
    ) : null;
  const heroClass = cn(
    'fsl-pay__hero flex flex-col items-center text-center gap-1',
    hasQr && 'lg:col-start-2 lg:row-start-1 lg:items-start lg:text-left',
  );

  const hero =
    view.items.length <= 1 ? (
      <div className={cn('fsl-request__single', heroClass)} data-testid="request-single">
        <p className="m-0 text-base text-muted-foreground">{t('request.askedYou', { owner })}</p>
        <Amount value={view.total} size="xl" />
        {view.items[0] && (
          <p className="m-0 text-sm text-muted-foreground">{getItemLabel(view.items[0], owner, t)}</p>
        )}
        {toLine}
      </div>
    ) : (
      <div className={cn('fsl-request__netted', heroClass)} data-testid="request-netted">
        <h2 className="m-0 text-base font-medium text-muted-foreground">{t('request.youOwe', { owner })}</h2>
        <Amount value={view.total} size="xl" />
        {toLine}
      </div>
    );

  // "I've paid" and its hint: on a phone the Screen's sticky bar, on a wide screen inline under the details.
  const footer = isWaiting ? null : (
    <>
      {submitError !== null && <InlineError error={submitError} onRetry={handlePaid} />}
      {/* Secondary next to the QR's "Open bank app", like the group pay page; the only action without a QR. */}
      <Button
        variant={hasQr ? 'secondary' : 'primary'}
        block
        loading={isSending}
        disabled={isSending}
        onClick={handlePaid}
        data-testid="request-paid"
      >
        {t('request.paid')}
      </Button>
      <p className="fsl-pay__hint m-0 text-sm text-muted-foreground text-center">{t('pay.iPaidHint')}</p>
    </>
  );

  const extras = (
    <>
      {isWaiting && (
        <div
          className="fsl-request__waiting bg-card border border-border rounded-xl p-4 text-center"
          data-testid="request-waiting"
        >
          <p className="m-0 text-base font-semibold text-foreground">{t('request.waiting', { owner })}</p>
        </div>
      )}
      <CoversButton places={places} owner={owner} />
      {!isWaiting && (
        <p className="fsl-request__cash-hint m-0 text-sm text-muted-foreground text-center">
          {t('request.cashHint', { owner })}
        </p>
      )}
    </>
  );

  return (
    <Screen title={t('pay.title', { name: owner })} wide={hasQr} bottomBar={wide ? undefined : (footer ?? undefined)}>
      <div
        className={cn(
          'fsl-request fsl-pay flex flex-col gap-4 w-full py-4',
          // Only the QR view uses the two columns, like PayScreen.
          !hasQr && 'fsl-pay--narrow max-w-[480px] mx-auto',
        )}
      >
        {hasQr && view.pay && bank ? (
          <PayDetails info={view.pay} bank={bank} wide={wide} hero={hero} extras={extras} footer={footer} />
        ) : (
          <>
            {hero}
            {!isWaiting && (
              // Mirrors PayScreen's no-bank card; a guest can't remind or add bank details, so no actions.
              <EmptyState icon="bank" title={t('request.noBank', { owner })} className="fsl-request__no-bank" action={null} />
            )}
            <div className="fsl-pay__body flex flex-col gap-3 min-w-0">
              {extras}
              {wide && footer}
            </div>
          </>
        )}
      </div>
    </Screen>
  );
}
