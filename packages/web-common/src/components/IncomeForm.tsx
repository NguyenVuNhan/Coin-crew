import { useState, type FormEvent, type JSX, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatVnd, MAX_AMOUNT, parseVnd, type IncomeView, type TripView } from '@fsl/core';
import { cn } from '@/lib/utils';
import { useT } from '../i18n';
import { apiSend } from '../api/client';
import { incomeMinimum } from '../lib/fund';
import { fromEntryValue } from '../lib/splitInput';
import { Screen } from './Screen';
import { Button } from './Button';
import { InlineError } from './InlineError';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function getTodayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function IncomeForm({
  view,
  tripId,
  income,
  switcher,
  leave,
}: {
  view: TripView;
  tripId: string;
  income?: IncomeView;
  switcher?: ReactNode;
  leave(): void;
}): JSX.Element {
  const t = useT();
  const queryClient = useQueryClient();

  const [amountText, setAmountText] = useState(() => (income ? fromEntryValue('amounts', income.amount) : ''));
  const [spentOn, setSpentOn] = useState(() => (income ? income.spentOn : getTodayLocalDate()));
  const [description, setDescription] = useState(() => (income ? income.description : ''));
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);

  const parsed = parseVnd(amountText);
  const isAmountInvalid = amountText.trim() !== '' && parsed === null;

  const minimum = income ? incomeMinimum(view, income) : 0;
  const isBelowMinimum = minimum > 0 && parsed !== null && parsed < minimum;

  const canSubmit =
    parsed !== null &&
    parsed > 0 &&
    parsed <= MAX_AMOUNT &&
    description.trim().length >= 1 &&
    description.trim().length <= 80 &&
    spentOn.trim() !== '' &&
    !isBelowMinimum;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || busy || parsed === null) return;

    setBusy(true);
    setSubmitError(null);

    const body = {
      amount: parsed,
      spentOn,
      description: description.trim(),
    };

    try {
      if (income) {
        await apiSend(`/api/trips/${tripId}/fund/incomes/${income.id}`, 'PATCH', body, tripId);
      } else {
        await apiSend(`/api/trips/${tripId}/fund/incomes`, 'POST', body, tripId);
      }
      await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
      leave();
    } catch (err) {
      setSubmitError(err);
    } finally {
      setBusy(false);
    }
  };

  const isEdit = Boolean(income);
  const title = t(isEdit ? 'fund.editTitle' : 'fund.addTitle');
  const submitText = t(isEdit ? 'expenseForm.save' : 'fund.add');

  return (
    <Screen
      title={title}
      onBack={leave}
      bottomBar={
        <>
          {submitError ? <InlineError error={submitError} /> : null}
          <Button
            type="submit"
            form="income-form"
            variant="primary"
            block
            loading={busy}
            disabled={!canSubmit || busy}
          >
            {submitText}
          </Button>
        </>
      }
    >
      <form
        id="income-form"
        onSubmit={handleSubmit}
        className={cn(
          'fsl-expense-form flex flex-col gap-4 w-full',
          Boolean(submitError) && 'fsl-income-form--bar-error max-lg:pb-24',
        )}
      >
        {switcher}

        <div className={cn('fsl-field flex flex-col gap-1.5')}>
          <Label htmlFor="income-amount" className={cn('fsl-field-label text-foreground')}>
            {t('expenseForm.amount')}
          </Label>
          <Input
            id="income-amount"
            type="text"
            inputMode="decimal"
            className={cn('fsl-input fsl-input--amount font-semibold tabular-nums')}
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            aria-describedby={isAmountInvalid ? 'income-amount-error' : 'income-amount-hint'}
          />
          {parsed !== null && (
            <div className={cn('fsl-amount-preview text-sm font-semibold tabular-nums text-muted-foreground')}>
              {formatVnd(parsed)}
            </div>
          )}
          {isAmountInvalid ? (
            <div id="income-amount-error" role="alert" className={cn('fsl-field-error text-sm text-danger')}>
              {t('expenseForm.amountInvalid')}
            </div>
          ) : (
            <div id="income-amount-hint" className={cn('fsl-field-hint text-sm text-muted-foreground')}>
              {t('expenseForm.amountHint')}
            </div>
          )}
          {isBelowMinimum && (
            <p className={cn('fsl-income-form__min m-0 mt-1 text-sm text-danger')} role="status">
              {t('fund.keepAtLeast', { amount: formatVnd(minimum) })}
            </p>
          )}
        </div>

        <div className={cn('fsl-field flex flex-col gap-1.5')}>
          <Label htmlFor="income-date" className={cn('fsl-field-label text-foreground')}>
            {t('expenseForm.date')}
          </Label>
          <Input
            id="income-date"
            type="date"
            className={cn('fsl-input')}
            value={spentOn}
            onChange={(e) => setSpentOn(e.target.value)}
          />
        </div>

        <div className={cn('fsl-field flex flex-col gap-1.5')}>
          <Label htmlFor="income-note" className={cn('fsl-field-label text-foreground')}>
            {t('fund.note')}
          </Label>
          <Input
            id="income-note"
            type="text"
            maxLength={80}
            placeholder={t('fund.notePlaceholder')}
            className={cn('fsl-input')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </form>
    </Screen>
  );
}
