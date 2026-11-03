import { useEffect, useRef, useState, useId } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  formatVnd,
  parseVnd,
  payerLabel,
  rowSlots,
  slotTiles,
  expenseShareOf,
  type PaymentView,
  type TripView,
} from '@cc/core';
import { cn } from '@cc/web-ui/lib/utils';
import { apiSend } from '@cc/web-data-access/client';
import { useT, getLang } from '@cc/web-i18n';
import { expenseLink, remind, remindText } from '../lib/remind';
import { nameOf } from '@cc/web-util/tripText';
import { formatDay } from '@cc/web-util/time';
import { Avatar } from '@cc/web-ui/components/Avatar';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { showUndo } from './UndoSnackbarHost';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Input } from '@cc/web-ui/components/ui/input';

export interface ExpensePaymentsApprovalProps {
  view: TripView;
  expenseId: string;
  paymentIds: string[];
}

interface SplitRowInfo {
  pid: string;
  rawName: string;
  share: number;
  slots: number;
  state: 'waiting' | 'confirmed' | 'not_reported';
  waitingPayment?: PaymentView;
  confirmedPayment?: PaymentView;
  paidBy: 'self' | 'friend';
  nameLabel: string;
  amount: number;
}

export function ExpensePaymentsApproval({
  view,
  expenseId,
  paymentIds,
}: ExpensePaymentsApprovalProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const tripId = view.trip.id;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Detail Sheet state
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<SplitRowInfo | null>(null);
  const [otherAmount, setOtherAmount] = useState<number>(0);
  const [otherText, setOtherText] = useState<string>('');

  const expense = view.expenses.find(
    (e) => e.id === expenseId || e.rootId === expenseId,
  );

  // The undo lives in the app-wide host: confirming the last waiting row removes this card.
  const showSnackbar = (paymentId: string, name: string, amount: number) => {
    showUndo({
      message: t('epa.confirmed', { name, amount: formatVnd(amount) }),
      actionLabel: t('epa.undo'),
      onAction: () => {
        void apiSend(`/api/trips/${tripId}/payments/${paymentId}/revise`, 'POST', { action: 'undo' }, tripId)
          .then(() => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }))
          .catch(() => queryClient.invalidateQueries({ queryKey: ['trip', tripId] }));
      },
    });
  };

  if (!expense) return null;

  const rootId = expense.rootId ?? expense.id;
  const isSport = !!expense.meta?.sport;

  // Find all split participants except the payer
  const splitPeopleIds = Array.from(
    new Set(
      expense.shares
        .filter((s) => s.participantId !== expense.payerId)
        .map((s) => s.participantId),
    ),
  );

  const rows: SplitRowInfo[] = splitPeopleIds.map((pid) => {
    const person = view.people.find((p) => p.id === pid);
    const rawName = nameOf(view, pid);
    const share = expenseShareOf(expense, pid);
    const slots = rowSlots(expense, pid);
    const fromIsMember = person?.isMember ?? false;

    // Payments for this person linked to this expense
    const personPayments = view.payments.filter(
      (p) =>
        p.fromId === pid &&
        (p.expenseId === rootId ||
          p.expenseId === expense.id ||
          paymentIds.includes(p.id)),
    );

    const waitingPayment =
      personPayments.find((p) => p.status === 'says_paid' && !p.notArrived) ??
      paymentIds
        .map((id) => view.payments.find((p) => p.id === id))
        .find((p) => p && p.fromId === pid && p.status === 'says_paid' && !p.notArrived);

    const confirmedPayment = personPayments.find(
      (p) => p.status === 'confirmed' && !p.notArrived,
    );

    let state: 'waiting' | 'confirmed' | 'not_reported' = 'not_reported';
    if (waitingPayment) {
      state = 'waiting';
    } else if (confirmedPayment) {
      state = 'confirmed';
    }

    const activePayment = waitingPayment ?? confirmedPayment;
    const paidBy = activePayment?.paidBy ?? 'self';
    const labelKind = payerLabel({ paidBy, fromIsMember, slots });

    let nameLabel = rawName;
    if (state !== 'not_reported') {
      if (labelKind === 'friend') {
        nameLabel = t('epa.friendOf', { name: rawName });
      } else if (labelKind === 'name_or_friend') {
        nameLabel = t('epa.nameOrFriend', { name: rawName });
      }
    }

    const amount = activePayment
      ? (activePayment.amountConfirmed ?? activePayment.amountClaimed)
      : share;

    return {
      pid,
      rawName,
      share,
      slots,
      state,
      waitingPayment,
      confirmedPayment,
      paidBy,
      nameLabel,
      amount,
    };
  });

  const waitingPayments = rows
    .filter((r) => r.state === 'waiting' && r.waitingPayment)
    .map((r) => r.waitingPayment!);

  const waitingSum = waitingPayments.reduce((sum, p) => sum + p.amountClaimed, 0);

  // Confirmed linked payments for progress calculation
  const confirmedPayments = view.payments.filter(
    (p) =>
      (p.expenseId === rootId || p.expenseId === expense.id) &&
      p.status === 'confirmed' &&
      !p.notArrived,
  );
  const confirmedSum = confirmedPayments.reduce(
    (sum, p) => sum + (p.amountConfirmed ?? p.amountClaimed),
    0,
  );
  const notReportedCount = rows.filter((r) => r.state === 'not_reported').length;
  // What the others owe the payer: the payer's own share never comes in.
  const owedTotal = expense.amount - expenseShareOf(expense, expense.payerId);
  const progressPct =
    owedTotal > 0
      ? Math.min(100, Math.round((confirmedSum / owedTotal) * 100))
      : 0;

  const handleConfirm = async (payment: PaymentView, name: string) => {
    try {
      setBusy(true);
      await apiSend(
        `/api/trips/${tripId}/payments/${payment.id}/confirm`,
        'POST',
        {},
        tripId,
      );
      await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
      showSnackbar(payment.id, name, payment.amountClaimed);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmAll = async () => {
    try {
      setBusy(true);
      for (const p of waitingPayments) {
        await apiSend(
          `/api/trips/${tripId}/payments/${p.id}/confirm`,
          'POST',
          {},
          tripId,
        );
      }
      await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
      if (waitingPayments.length > 0) {
        const last = waitingPayments[waitingPayments.length - 1]!;
        const r = rows.find((row) => row.pid === last.fromId);
        showSnackbar(last.id, r?.nameLabel ?? nameOf(view, last.fromId), last.amountClaimed);
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const openDetail = (row: SplitRowInfo) => {
    const payment = row.waitingPayment ?? row.confirmedPayment;
    if (!payment) return;
    const person = view.people.find((p) => p.id === row.pid);
    const tiles = slotTiles(expense, row.pid, person?.gender, row.share);
    const initialAmt = tiles.length > 0 ? tiles[0]!.amount : row.amount;

    setSelectedRow(row);
    setOtherAmount(initialAmt);
    setOtherText(String(initialAmt));
    setDetailOpen(true);
  };

  const selectedPayment = selectedRow
    ? (selectedRow.waitingPayment ?? selectedRow.confirmedPayment)
    : undefined;

  const selectedPerson = selectedRow
    ? view.people.find((p) => p.id === selectedRow.pid)
    : undefined;

  const tiles =
    selectedRow && expense
      ? slotTiles(expense, selectedRow.pid, selectedPerson?.gender, selectedRow.share)
      : [];

  const handleReceived = async () => {
    if (!selectedPayment || !selectedRow) return;
    setDetailOpen(false);
    if (selectedPayment.status === 'says_paid') {
      await handleConfirm(selectedPayment, selectedRow.nameLabel);
    }
  };

  const handleOtherSubmit = async () => {
    if (!selectedPayment || !selectedRow || !otherAmount) return;
    setDetailOpen(false);
    try {
      setBusy(true);
      if (selectedPayment.status === 'confirmed') {
        await apiSend(
          `/api/trips/${tripId}/payments/${selectedPayment.id}/revise`,
          'POST',
          { action: 'amount', amount: otherAmount },
          tripId,
        );
      } else {
        await apiSend(
          `/api/trips/${tripId}/payments/${selectedPayment.id}/confirm`,
          'POST',
          { amount: otherAmount },
          tripId,
        );
        showSnackbar(selectedPayment.id, selectedRow.nameLabel, otherAmount);
      }
      await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleNotReceived = async () => {
    if (!selectedPayment || !selectedRow) return;
    setDetailOpen(false);
    try {
      setBusy(true);
      if (selectedPayment.status === 'confirmed') {
        await apiSend(
          `/api/trips/${tripId}/payments/${selectedPayment.id}/revise`,
          'POST',
          { action: 'not_arrived' },
          tripId,
        );
      } else {
        await apiSend(
          `/api/trips/${tripId}/payments/${selectedPayment.id}/not-arrived`,
          'POST',
          {},
          tripId,
        );
      }
      await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fsl-epa flex flex-col gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground">
      {/* Header */}
      <div className="fsl-epa__header flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon
            name={isSport ? 'trophy' : 'receipt'}
            size={22}
            className="text-primary shrink-0"
          />
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-base text-foreground break-words">
              {expense.description} · {formatDay(expense.spentOn)}
            </span>
            <span className="text-xs text-muted-foreground">
              {t('epa.reported', { n: waitingPayments.length })}
            </span>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="fsl-epa__progress flex flex-col gap-1.5">
        <div className="flex justify-between items-center text-xs text-muted-foreground tabular-nums">
          <span>
            {t('epa.progress', {
              got: formatVnd(confirmedSum),
              total: formatVnd(owedTotal),
            })}
          </span>
          <span>{t('epa.notReported', { n: notReportedCount })}</span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-secondary"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-success transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Rows */}
      <div className="fsl-epa__rows flex flex-col divide-y divide-border/60">
        {rows.map((row) => (
          <div
            key={row.pid}
            data-testid={`epa-row-${row.pid}`}
            className={cn(
              'fsl-epa__row flex items-center justify-between gap-3 min-h-11 py-2',
              row.state === 'not_reported' && 'opacity-60 text-muted-foreground',
            )}
          >
            {/* Row body */}
            <button
              type="button"
              className={cn(
                'flex flex-1 items-center gap-3 text-left bg-transparent border-0 p-0 m-0 min-h-11 font-inherit text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg',
                row.state !== 'not_reported' ? 'cursor-pointer' : 'cursor-default',
              )}
              onClick={() => {
                if (row.state !== 'not_reported') openDetail(row);
              }}
            >
              <div className="relative inline-flex shrink-0">
                <Avatar name={row.rawName} />
                {row.paidBy === 'friend' && (
                  <span
                    className="fsl-epa__badge absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground"
                    data-testid="epa-badge-friend"
                    title={t('epa.friendOf', { name: row.rawName })}
                  >
                    <Icon name="userPlus" size={10} />
                  </span>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-semibold text-foreground truncate">
                  {row.nameLabel}
                </span>
                {row.state === 'waiting' && row.waitingPayment?.claimPending && (
                  <div className="flex items-center gap-1 text-sm text-warning-foreground">
                    <Icon name="info" size={14} className="shrink-0" />
                    <span>{t('claim.paymentFlag', { name: row.rawName })}</span>
                  </div>
                )}
              </div>
              <span className="tabular-nums text-sm font-semibold text-foreground shrink-0">
                {formatVnd(row.amount)}
              </span>
            </button>

            {/* Action button */}
            <div className="shrink-0 flex items-center justify-center">
              {row.state === 'waiting' && row.waitingPayment && (
                <button
                  type="button"
                  data-testid={`epa-tick-${row.pid}`}
                  aria-label={t('approvals.confirm')}
                  className="min-h-11 min-w-11 size-11 rounded-full p-0 flex items-center justify-center border border-muted-foreground/30 text-muted-foreground hover:border-foreground hover:bg-muted/50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                  onClick={() => handleConfirm(row.waitingPayment!, row.nameLabel)}
                >
                  <Icon name="check" size={20} />
                </button>
              )}
              {row.state === 'confirmed' && (
                <button
                  type="button"
                  data-testid={`epa-tick-${row.pid}`}
                  aria-label={t('epa.confirmed', {
                    name: row.rawName,
                    amount: formatVnd(row.amount),
                  })}
                  className="min-h-11 min-w-11 size-11 rounded-full p-0 flex items-center justify-center bg-success text-success-foreground hover:opacity-90 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-opacity"
                  onClick={() => openDetail(row)}
                >
                  <Icon name="check" size={20} />
                </button>
              )}
              {row.state === 'not_reported' && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    void remind(
                      remindText(getLang(), {
                        name: row.rawName,
                        creditor: nameOf(view, expense.payerId),
                        amount: formatVnd(row.amount),
                        trip: view.trip.name,
                        link: expenseLink(view, rootId),
                      }),
                    )
                  }
                  aria-label={t('pay.remindThem', { name: row.rawName })}
                  className="size-11 min-h-11 min-w-11 rounded-full p-0 flex items-center justify-center text-muted-foreground hover:bg-muted"
                >
                  <Icon name="bell" size={20} />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer Confirm All */}
      {waitingPayments.length > 0 && (
        <div className="fsl-epa__footer mt-1 flex flex-col gap-2">
          <Button
            variant="primary"
            block
            loading={busy}
            className="min-h-11"
            onClick={handleConfirmAll}
          >
            {t('epa.confirmAll', { sum: formatVnd(waitingSum) })}
          </Button>
        </div>
      )}

      {error ? <InlineError error={error} /> : null}

      {/* Detail Sheet */}
      <Sheet
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={selectedRow?.rawName ?? ''}
      >
        {selectedRow && selectedPayment && (
          <div className="flex flex-col gap-3 p-4">
            {selectedPayment.status === 'says_paid' && selectedPayment.claimPending && (
              <div className="flex items-center gap-1.5 text-sm text-warning-foreground">
                <Icon name="info" size={16} className="shrink-0" />
                <span>{t('claim.paymentFlag', { name: selectedRow.rawName })}</span>
              </div>
            )}
            {/* ✓ Đã nhận {amount} */}
            <Button
              variant="primary"
              block
              className="min-h-11 flex items-center justify-center gap-2"
              onClick={handleReceived}
            >
              <Icon name="check" size={18} />
              <span>{t('epa.received', { amount: formatVnd(selectedRow.amount) })}</span>
            </Button>

            {/* ✎ Số khác */}
            <div className="fsl-epa__other flex flex-col gap-2.5 rounded-lg border border-border p-3">
              <span className="text-xs font-semibold text-muted-foreground">
                {t('epa.other')}
              </span>
              {tiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {tiles.map((tile, i) => (
                    <Button
                      key={i}
                      variant={otherAmount === tile.amount ? 'primary' : 'secondary'}
                      className="min-h-11 flex-1 flex items-center justify-center gap-1.5"
                      onClick={() => {
                        setOtherAmount(tile.amount);
                        setOtherText(String(tile.amount));
                      }}
                    >
                      <Icon name={tile.gender === 'F' ? 'venus' : 'mars'} size={16} />
                      <span className="tabular-nums">{formatVnd(tile.amount)}</span>
                    </Button>
                  ))}
                </div>
              )}
              <Input
                className="tabular-nums text-base min-h-11"
                inputMode="decimal"
                placeholder={t('epa.other')}
                value={otherText}
                onChange={(e) => {
                  setOtherText(e.target.value);
                  const val = parseVnd(e.target.value);
                  if (val !== null) setOtherAmount(val);
                }}
              />
              <Button
                variant="secondary"
                block
                className="min-h-11 flex items-center justify-center gap-2"
                disabled={!otherAmount || otherAmount <= 0}
                onClick={handleOtherSubmit}
              >
                <Icon name="edit" size={18} />
                <span>{t('epa.other')}</span>
                {otherAmount ? (
                  <span className="tabular-nums"> · {formatVnd(otherAmount)}</span>
                ) : null}
              </Button>
            </div>

            {/* ✕ Chưa nhận */}
            <Button
              variant="danger"
              block
              className="min-h-11 flex items-center justify-center gap-2"
              onClick={handleNotReceived}
            >
              <Icon name="x" size={18} />
              <span>{t('epa.notReceived')}</span>
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
