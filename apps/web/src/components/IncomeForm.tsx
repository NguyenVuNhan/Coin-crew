import { useState, type FormEvent, type JSX, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatVnd, MAX_AMOUNT, parseVnd, type IncomeView, type TripView } from '@fsl/core';
import { useT } from '../i18n';
import { apiSend } from '../api/client';
import { incomeMinimum } from '../lib/fund';
import { fromEntryValue } from '../lib/splitInput';
import { Screen } from './Screen';
import { Button } from './Button';
import { InlineError } from './InlineError';
import './IncomeForm.css';

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
        className={`fsl-expense-form${submitError ? ' fsl-income-form--bar-error' : ''}`}
      >
        {switcher}

        <div className="fsl-field">
          <label htmlFor="income-amount" className="fsl-field-label">
            {t('expenseForm.amount')}
          </label>
          <input
            id="income-amount"
            type="text"
            inputMode="decimal"
            className="fsl-input fsl-input--amount"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            aria-describedby={isAmountInvalid ? 'income-amount-error' : 'income-amount-hint'}
          />
          {parsed !== null && (
            <div className="fsl-amount-preview">
              {formatVnd(parsed)}
            </div>
          )}
          {isAmountInvalid ? (
            <div id="income-amount-error" role="alert" className="fsl-field-error">
              {t('expenseForm.amountInvalid')}
            </div>
          ) : (
            <div id="income-amount-hint" className="fsl-field-hint">
              {t('expenseForm.amountHint')}
            </div>
          )}
          {isBelowMinimum && (
            <p className="fsl-income-form__min" role="status">
              {t('fund.keepAtLeast', { amount: formatVnd(minimum) })}
            </p>
          )}
        </div>

        <div className="fsl-field">
          <label htmlFor="income-date" className="fsl-field-label">
            {t('expenseForm.date')}
          </label>
          <input
            id="income-date"
            type="date"
            className="fsl-input"
            value={spentOn}
            onChange={(e) => setSpentOn(e.target.value)}
          />
        </div>

        <div className="fsl-field">
          <label htmlFor="income-note" className="fsl-field-label">
            {t('fund.note')}
          </label>
          <input
            id="income-note"
            type="text"
            maxLength={80}
            placeholder={t('fund.notePlaceholder')}
            className="fsl-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </form>
    </Screen>
  );
}
