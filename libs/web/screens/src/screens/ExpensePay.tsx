import { useState, useEffect } from 'react';
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router';
import { formatVnd, payerLabel, type ExpensePayView, type PaidBy } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { useTrip } from '../lib/tripBase';
import { useTripView, useMe } from '@cc/web-data-access/hooks';
import { useExpensePay, useReportExpensePayment } from '@cc/web-data-access/expensePay';
import { Screen } from '../components/Screen';
import { Button } from '@cc/web-ui/components/Button';
import { Amount } from '@cc/web-ui/components/Amount';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { PayQr } from '../components/PayQr';
import { Icon } from '@cc/web-ui/components/icons';
import { Skeleton } from '@cc/web-ui/components/Skeleton';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { WhoPaidSheet } from '../components/WhoPaidSheet';
import { MergeConfirmSheet } from '../components/MergeConfirmSheet';
import { SportBillTable } from '../components/SportBillTable';
import { sportBillCalc } from '../lib/sportBill';
import { browserUrl } from '@cc/web-util/openInBrowser';
import { formatDay } from '@cc/web-util/time';
import { nameOf } from '@cc/web-util/tripText';

function ClaimWaitingStrip({ name }: { name: string }) {
  const t = useT();
  const [showSteps, setShowSteps] = useState(false);
  const currentHref = typeof window !== 'undefined' && window.location ? window.location.href : '';
  const openBrowserHref = browserUrl(currentHref);

  return (
    <div className="rounded-xl bg-warning-soft px-4 py-3 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm text-foreground">
        <Icon name="clock" size={16} className="shrink-0" />
        <span>{t('claim.waiting', { name })}</span>
      </div>
      {openBrowserHref ? (
        <Button
          variant="ghost"
          block
          href={openBrowserHref}
          className="min-h-11 justify-center"
        >
          {t('claim.openBrowser')}
        </Button>
      ) : (
        <>
          <Button
            variant="ghost"
            block
            onClick={() => setShowSteps((s) => !s)}
            className="min-h-11 justify-center"
          >
            {t('claim.openBrowser')}
          </Button>
          {showSteps && (
            <p className="m-0 text-sm text-muted-foreground text-center">
              {t('claim.browserSteps')}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function ExpensePay() {
  const { tripId, href } = useTrip();
  const { expenseId = '' } = useParams<{ expenseId: string }>();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const t = useT();

  const [claimParam, setClaimParam] = useState<string | null>(() => searchParams.get('claim'));
  const [mergeConfirmOpen, setMergeConfirmOpen] = useState(
    () => searchParams.get('claim') === 'incoming',
  );

  useEffect(() => {
    const claim = searchParams.get('claim');
    if (claim) {
      setClaimParam(claim);
      if (claim === 'incoming') {
        setMergeConfirmOpen(true);
      }
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('claim');
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const {
    view,
    error: viewError,
    isLoading: isViewLoading,
    refetch: refetchView,
  } = useTripView(tripId, 5000, { stopAfterMs: 10 * 60_000 });

  const {
    data: payData,
    error: payError,
    isLoading: isPayLoading,
    refetch: refetchPay,
  } = useExpensePay(tripId, expenseId, view?.trip.version ?? 0);

  const me = useMe({ enabled: claimParam === 'incoming' }).data;

  const reportMutation = useReportExpensePayment(tripId, expenseId);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);

  if (viewError || payError) {
    return (
      <Screen title="" back={tripId ? href('/') : undefined}>
        <InlineError
          error={viewError || payError}
          onRetry={() => {
            if (viewError) refetchView();
            if (payError) refetchPay();
          }}
        />
      </Screen>
    );
  }

  if (isViewLoading || isPayLoading || !view || !payData) {
    return (
      <Screen title="" back={tripId ? href('/') : undefined}>
        <div className="fsl-expense-pay flex flex-col gap-4 py-2">
          <Skeleton height={80} radius="lg" />
          <Skeleton width={240} height={240} radius="lg" className="mx-auto" />
        </div>
      </Screen>
    );
  }

  const row = 'row' in payData ? payData.row : null;
  const billExpense = view.expenses.find((x) => x.id === expenseId || x.rootId === expenseId);

  if (!row) {
    const waiting = payData.row === null ? payData.claim : undefined;
    if (waiting) {
      // A Zalo account waiting to join someone who owes nothing here: stay locked, never back to "Who are you?".
      return (
        <Screen title="">
          <div
            data-testid="pay-locked"
            className="fsl-expense-pay flex flex-col gap-4 max-w-[480px] mx-auto w-full py-4"
          >
            <ClaimWaitingStrip name={waiting.name} />
            <p className="fsl-expense-pay__nothing m-0 text-base text-center text-muted-foreground">
              {t('claim.nothingToPay', { name: waiting.name })}
            </p>
          </div>
        </Screen>
      );
    }
    if (view.me.participantId === null) {
      const currentPath = location.pathname + location.search;
      return (
        <Navigate
          to={`${href('/who')}?expense=${encodeURIComponent(expenseId)}&next=${encodeURIComponent(currentPath)}`}
          replace
        />
      );
    }
    if (billExpense && billExpense.payerId === view.me.participantId) {
      return <Navigate to={href(`/expenses/${encodeURIComponent(expenseId)}`)} replace />;
    }
    const name = nameOf(view, view.me.participantId);
    return (
      <Screen title="" back={href('/')}>
        <div className="fsl-expense-pay fsl-expense-pay__nothing-here flex flex-col items-center gap-4 max-w-[480px] mx-auto w-full py-8 text-center">
          <p className="m-0 text-base font-medium text-foreground">
            {t('expensePay.nothingHere', { name })}
          </p>
          {view.me.kind === 'guest' && (
            <Link
              to={
                href('/who') +
                '?expense=' +
                encodeURIComponent(expenseId) +
                '&next=' +
                encodeURIComponent(location.pathname + location.search)
              }
              className="fsl-expense-pay__switch inline-flex min-h-11 items-center text-primary font-semibold"
            >
              {t('guest.switch', { name })}
            </Link>
          )}
          <Button variant="ghost" href={href()} className="fsl-expense-pay__see-group">
            {t('owe.seeGroup')}
          </Button>
        </div>
      </Screen>
    );
  }

  const v = payData as ExpensePayView;
  const isLocked = v.viewer === 'claim';
  const claimName = v.claim?.name ?? v.row.name;
  const incomingRequest =
    me?.mergeRequests.incoming.find((r) => r.survivor.name === claimName) ??
    me?.mergeRequests.incoming?.[0];

  const calc = billExpense ? sportBillCalc(view, billExpense) : null;

  const onPaid = async () => {
    if (!isLocked && v.row.slots >= 2) {
      setSheetOpen(true);
      return;
    }
    setSubmitError(null);
    try {
      await reportMutation.mutateAsync({
        amount: v.row.remaining,
        paidBy: v.viewer === 'claim' ? 'self' : v.viewer,
      });
    } catch (err) {
      setSubmitError(err);
    }
  };

  const handleSheetReport = async (r: { amount: number; paidBy: PaidBy }) => {
    setSubmitError(null);
    try {
      await reportMutation.mutateAsync(r);
    } catch (err) {
      setSubmitError(err);
      throw err;
    }
  };

  return (
    <Screen title={t('expensePay.title', { name: v.payer.name })} back={isLocked ? undefined : href('/')}>
      <div
        data-testid={isLocked ? 'pay-locked' : undefined}
        className="fsl-expense-pay flex flex-col gap-4 max-w-[480px] mx-auto w-full py-4"
      >
        {claimParam === 'taken' && (
          <p role="alert" className="m-0 text-sm text-danger">
            {t('claim.taken', { name: claimName })}
          </p>
        )}

        {claimParam === 'invalid' && (
          <InlineError error={new Error()} />
        )}

        {isLocked && (
          <ClaimWaitingStrip name={claimName} />
        )}

        <div className="fsl-expense-pay__header flex flex-col items-center text-center gap-1">
          <p className="fsl-expense-pay__subtitle m-0 text-sm text-muted-foreground">
            {`${v.expense.description} · ${formatDay(v.expense.spentOn)}`}
          </p>
          <p className="fsl-expense-pay__row-label m-0 text-base font-medium text-foreground">
            {t('expensePay.rowLabel', { name: v.row.name })}
          </p>
        </div>

        {v.row.remaining > 0 ? (
          <>
            {v.pay && v.pay.bankState === 'ok' ? (
              <PayQr variant="pay" info={v.pay} />
            ) : (
              <>
                <div className="fsl-expense-pay__amount flex justify-center py-2">
                  <Amount value={v.row.remaining} size="lg" />
                </div>
                <p className="fsl-expense-pay__bank-notice m-0 text-sm text-muted-foreground text-center">
                  {t(v.pay?.bankState === 'pending' ? 'pay.bankPending' : 'pay.bankNone', {
                    name: v.payer.name,
                  })}
                </p>
              </>
            )}

            {submitError !== null && <InlineError error={submitError} onRetry={onPaid} />}

            <Button
              variant="primary"
              block
              loading={reportMutation.isPending}
              onClick={onPaid}
            >
              {t('pay.iPaid')}
            </Button>
          </>
        ) : (
          <div className="fsl-expense-pay__all-paid flex items-center justify-center p-4 text-center font-medium text-success">
            <span>{t('expensePay.allPaid')}</span>
          </div>
        )}

        {billExpense && (
          <Button
            variant="secondary"
            block
            className="fsl-expense-pay__view-bill"
            onClick={() => setBillOpen(true)}
          >
            {t('expensePay.viewBill')}
          </Button>
        )}

        {v.paid.length > 0 && (
          <div className="fsl-expense-pay__paid-list flex flex-col gap-2 pt-2 border-t border-border">
            {v.paid.map((p) => {
              const isNotReceived = p.notArrived || p.status === 'rejected';
              const labelKind = payerLabel({
                paidBy: p.paidBy,
                fromIsMember: v.row.isMember,
                slots: v.row.slots,
              });
              let who = v.row.name;
              if (labelKind === 'friend') {
                who = t('expensePay.friendOf', { name: v.row.name });
              } else if (labelKind === 'name_or_friend') {
                who = t('expensePay.nameOrFriend', { name: v.row.name });
              }

              if (isNotReceived) {
                return (
                  <div
                    key={p.paymentId}
                    className="fsl-expense-pay__paid flex items-center gap-2 min-h-11 text-sm text-danger"
                  >
                    <Icon name="x" size={16} className="shrink-0" />
                    <span className="tabular-nums">
                      {t('expensePay.notReceived', {
                        payer: v.payer.name,
                        amount: formatVnd(p.amount),
                      })}
                    </span>
                  </div>
                );
              }

              const isWaiting = p.status === 'says_paid';

              return (
                <div
                  key={p.paymentId}
                  className="fsl-expense-pay__paid flex items-center flex-wrap gap-2 min-h-11 text-sm text-muted-foreground"
                >
                  <Icon
                    name={isWaiting ? 'clock' : 'circleCheck'}
                    size={16}
                    className={isWaiting ? 'text-muted-foreground shrink-0' : 'text-success shrink-0'}
                  />
                  <span className="tabular-nums text-foreground">
                    {t('expensePay.paidLine', {
                      who,
                      amount: formatVnd(p.amount),
                    })}
                  </span>
                  {isWaiting && (
                    <span className="text-muted-foreground">
                      {t('pay.waitingConfirm', { name: v.payer.name })}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <WhoPaidSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        row={v.row}
        viewer={v.viewer === 'claim' ? 'self' : v.viewer}
        onReport={handleSheetReport}
      />
      {incomingRequest && (
        <MergeConfirmSheet
          request={incomingRequest}
          open={mergeConfirmOpen}
          onClose={() => setMergeConfirmOpen(false)}
        />
      )}
      {billExpense && (
        <Sheet
          open={billOpen}
          onClose={() => setBillOpen(false)}
          title={t('expensePay.billTitle')}
        >
          {calc ? (
            <SportBillTable calc={calc} total={billExpense.amount} meId={view.me.participantId} />
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3 text-base">
                <span className="font-semibold text-foreground">{billExpense.description}</span>
                <Amount value={billExpense.amount} />
              </div>
              <div className="rounded-xl bg-card divide-y divide-border border border-border overflow-hidden">
                {billExpense.shares.map((s) => (
                  <div
                    key={s.participantId}
                    className="flex items-center justify-between gap-3 px-4 py-3 min-h-11 text-sm"
                  >
                    <span className="text-foreground">{nameOf(view, s.participantId)}</span>
                    <Amount value={s.amount} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </Sheet>
      )}
    </Screen>
  );
}
