import { useState, type JSX } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { RequestView, PersonItem } from '@fsl/core';
import { useT, type t as TFunction } from '../i18n';
import { ApiClientError, apiFetch, apiSend } from '../api/client';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { Amount } from '../components/Amount';
import { SkeletonList } from '../components/Skeleton';
import { InlineError } from '../components/InlineError';
import { EmptyState } from '../components/EmptyState';
import { PayQr } from '../components/PayQr';
import { cn } from '@/lib/utils';

function getItemLabel(item: PersonItem, owner: string, t: TFunction): string {
  return item.kind === 'direct' ? t('request.quickExpenses', { owner }) : item.tripName;
}

export function RequestPage(): JSX.Element {
  const { token = '' } = useParams<{ token: string }>();
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
          <div className="fsl-request__items bg-card border border-border rounded-xl divide-y divide-border">
            {view.items.map((item) => (
              <div
                key={item.tripId}
                data-testid={`request-item-${item.tripId}`}
                className="flex items-center justify-between px-4 py-3 min-h-11 text-sm"
              >
                <span className="font-medium text-foreground truncate mr-2">
                  {getItemLabel(item, owner, t)}
                </span>
                <span className={cn('font-semibold tabular-nums whitespace-nowrap shrink-0 flex items-center gap-0.5', item.amount < 0 ? 'text-success' : 'text-danger')}>
                  {item.amount < 0 && '−'}
                  <Amount
                    value={Math.abs(item.amount)}
                    tone={item.amount > 0 ? 'danger' : 'success'}
                  />
                </span>
              </div>
            ))}
          </div>
        </div>
      </Screen>
    );
  }

  return (
    <Screen title={t('request.title')}>
      <div className="fsl-request flex flex-col gap-4 py-4">
        {view.items.length <= 1 ? (
          <div
            className="fsl-request__single flex flex-col items-center text-center gap-1"
            data-testid="request-single"
          >
            <p className="m-0 text-base text-muted-foreground">
              {t('request.askedYou', { owner })}
            </p>
            <Amount value={view.total} size="xl" />
            {view.items[0] && (
              <p className="m-0 text-sm text-muted-foreground">
                {getItemLabel(view.items[0], owner, t)}
              </p>
            )}
          </div>
        ) : (
          <div className="fsl-request__netted flex flex-col gap-4" data-testid="request-netted">
            <div className="flex flex-col items-center text-center gap-1">
              <h2 className="m-0 text-base font-medium text-muted-foreground">
                {t('request.youOwe', { owner })}
              </h2>
              <Amount value={view.total} size="xl" />
            </div>
            <div className="fsl-request__items bg-card border border-border rounded-xl divide-y divide-border">
              {view.items.map((item) => (
                <div
                  key={item.tripId}
                  data-testid={`request-item-${item.tripId}`}
                  className="flex items-center justify-between px-4 py-3 min-h-11 text-sm"
                >
                  <span className="font-medium text-foreground truncate mr-2">
                    {getItemLabel(item, owner, t)}
                  </span>
                  <span className={cn('font-semibold tabular-nums whitespace-nowrap shrink-0 flex items-center gap-0.5', item.amount < 0 ? 'text-success' : 'text-danger')}>
                    {item.amount < 0 && '−'}
                    <Amount
                      value={Math.abs(item.amount)}
                      tone={item.amount > 0 ? 'danger' : 'success'}
                    />
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {isWaiting ? (
          <div
            className="fsl-request__waiting bg-card border border-border rounded-xl p-4 text-center"
            data-testid="request-waiting"
          >
            <p className="m-0 text-base font-semibold text-foreground">
              {t('request.waiting', { owner })}
            </p>
          </div>
        ) : (
          <>
            {view.pay && view.pay.payload ? (
              <PayQr info={view.pay} variant="pay" summary={false} />
            ) : (
              <p className="fsl-request__no-bank m-0 text-sm text-muted-foreground text-center">
                {t('request.noBank', { owner })}
              </p>
            )}
            <Button
              variant="primary"
              block
              loading={isSending}
              disabled={isSending}
              onClick={handlePaid}
              data-testid="request-paid"
            >
              {t('request.paid')}
            </Button>
            <p className="fsl-request__cash-hint m-0 text-sm text-muted-foreground text-center">
              {t('request.cashHint', { owner })}
            </p>
            {submitError !== null && (
              <InlineError error={submitError} onRetry={handlePaid} />
            )}
          </>
        )}
      </div>
    </Screen>
  );
}
