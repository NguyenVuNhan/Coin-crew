import { Navigate, useLocation } from 'react-router';
import { useT } from '@cc/web-i18n';
import { useTripView } from '@cc/web-data-access/hooks';
import { nameOf } from '@cc/web-util/tripText';
import { useTrip } from '../lib/tripBase';
import { owedTransfers, waitingPayments } from '../lib/owe';
import { Screen } from '../components/Screen';
import { Button } from '@cc/web-ui/components/Button';
import { Amount } from '@cc/web-ui/components/Amount';
import { Avatar } from '@cc/web-ui/components/Avatar';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Skeleton } from '@cc/web-ui/components/Skeleton';
import { Icon } from '@cc/web-ui/components/icons';

export function OweScreen() {
  const { tripId, base, viaLink, href } = useTrip();
  const location = useLocation();
  const t = useT();

  const {
    view,
    error,
    isLoading,
    refetch,
  } = useTripView(tripId, 20000, { stopAfterMs: 15 * 60_000 });

  if (error) {
    return (
      <Screen title="" back={tripId ? href() : undefined}>
        <InlineError error={error} onRetry={refetch} />
      </Screen>
    );
  }

  if (isLoading || !view) {
    return (
      <Screen title="" back={tripId ? href() : undefined}>
        <div className="fsl-owe__loading flex flex-col gap-4 py-2">
          <Skeleton height={80} radius="lg" />
          <Skeleton
            width={240}
            height={240}
            radius="lg"
            className="fsl-owe__skeleton-qr mx-auto"
          />
          <div className="fsl-owe__skeleton-rows flex flex-col gap-2">
            <Skeleton height={20} radius="sm" />
            <Skeleton height={20} radius="sm" />
            <Skeleton height={20} radius="sm" />
            <Skeleton height={20} radius="sm" />
          </div>
        </div>
      </Screen>
    );
  }

  // 1. Guest whose me.participantId is null, OR whose own row in view.people has status === 'left'
  if (view.me.kind === 'guest') {
    const myPerson = view.me.participantId ? view.people.find((p) => p.id === view.me.participantId) : null;
    if (view.me.participantId === null || myPerson?.status === 'left') {
      return (
        <Navigate
          replace
          to={href('/who') + '?next=' + encodeURIComponent(location.pathname + location.search)}
        />
      );
    }
  }

  // 2. Member on a link (viaLink)
  if (viaLink && view.me.kind === 'member') {
    const rest = location.pathname.slice(base.length) + location.search;
    return <Navigate replace to={`/t/${tripId}${rest}`} />;
  }

  // 3. view.trip.archived or me.kind === 'viewer'
  if (view.trip.archived || view.me.kind === 'viewer') {
    return <Navigate replace to={href()} />;
  }

  const transfers = owedTransfers(view);
  const waiting = waitingPayments(view);

  // 4. Exactly one owed transfer and no waiting payments
  if (transfers.length === 1 && waiting.length === 0) {
    const toId = transfers[0]!.toId;
    return <Navigate replace to={href(`/pay/${encodeURIComponent(toId)}`) + '?via=owe'} />;
  }

  // 5. Otherwise a Screen holding the grouped list / empty state and "See the group" button
  const myName = view.me.participantId ? nameOf(view, view.me.participantId) : '';

  return (
    <Screen
      title={transfers.length > 0 || waiting.length > 0 ? t('owe.title', { name: myName }) : view.trip.name}
      back={href()}
    >
      <div className="fsl-owe flex flex-col gap-4">
        {(transfers.length > 0 || waiting.length > 0) && (
          <div className="overflow-hidden rounded-xl bg-card divide-y divide-border">
            {transfers.map((transfer, index) => {
              const toName = nameOf(view, transfer.toId);
              const toPerson = view.people.find((p) => p.id === transfer.toId);
              return (
                <div
                  key={transfer.toId}
                  className="fsl-owe__row flex min-h-11 items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar name={toName} avatarUrl={toPerson?.avatarUrl} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-base font-semibold text-foreground">
                        {toName}
                      </span>
                      <Amount value={transfer.amount} tone="danger" size="sm" />
                    </div>
                  </div>
                  <Button
                    variant={index === 0 ? 'primary' : 'secondary'}
                    href={href(`/pay/${encodeURIComponent(transfer.toId)}`)}
                    className="max-w-[45%]"
                  >
                    <span className="truncate">{t('owe.pay', { name: toName })}</span>
                  </Button>
                </div>
              );
            })}
            {waiting.map((payment) => {
              const toName = nameOf(view, payment.toId);
              return (
                <div
                  key={payment.id}
                  className="fsl-owe__waiting flex min-h-11 items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning"
                      aria-hidden="true"
                    >
                      <Icon name="clock" size={20} />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-base font-semibold text-foreground">
                        {toName}
                      </span>
                      <span className="truncate text-sm font-medium text-warning">
                        {t('owe.waiting', { name: toName })}
                      </span>
                    </div>
                  </div>
                  <Amount value={payment.amountClaimed} className="shrink-0" />
                </div>
              );
            })}
          </div>
        )}

        {transfers.length === 0 && waiting.length === 0 && (
          <EmptyState
            className="fsl-owe__all-set"
            icon="circleCheck"
            title={t('owe.allSet')}
            body={t('owe.allSetBody', { trip: view.trip.name })}
            action={null}
          />
        )}

        <Button
          variant="ghost"
          href={href()}
          className="fsl-owe__see-group"
        >
          {t('owe.seeGroup')}
        </Button>
      </div>
    </Screen>
  );
}
