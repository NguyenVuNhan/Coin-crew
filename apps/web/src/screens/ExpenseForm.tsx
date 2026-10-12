import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { TripView, ExpenseView, ExpenseInput, SplitMode, SplitEntry, SplitError } from '@fsl/core';
import { computeShares, formatVnd, parseVnd } from '@fsl/core';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n/en';
import { useTripView } from '../api/hooks';
import { apiSend } from '../api/client';
import { toEntryValue, fromEntryValue } from '../lib/splitInput';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { Avatar } from '../components/Avatar';
import { InlineError } from '../components/InlineError';
import { Skeleton, SkeletonList } from '../components/Skeleton';
import './ExpenseForm.css';

function getTodayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const SPLIT_MODES: { mode: SplitMode; labelKey: MessageKey }[] = [
  { mode: 'equal', labelKey: 'split.tab.equal' },
  { mode: 'amounts', labelKey: 'split.tab.amounts' },
  { mode: 'percent', labelKey: 'split.tab.percent' },
  { mode: 'shares', labelKey: 'split.tab.shares' },
  { mode: 'adjust', labelKey: 'split.tab.adjust' },
];

const SPLIT_ERRORS = new Set<string>([
  'NO_PARTICIPANTS',
  'INVALID_AMOUNT',
  'AMOUNTS_DONT_ADD_UP',
  'PERCENT_NOT_100',
  'SHARES_NOT_POSITIVE',
  'NEGATIVE_SHARE',
]);

interface ExpenseFormContentProps {
  view: TripView;
  tripId: string;
  expenseId?: string;
  expense?: ExpenseView;
}

function ExpenseFormContent({ view, tripId, expenseId, expense }: ExpenseFormContentProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const isEdit = Boolean(expenseId);
  const me = view.me.participantId;

  // Form field states
  const [description, setDescription] = useState(() => expense?.description ?? '');
  const [amountText, setAmountText] = useState(() =>
    expense ? fromEntryValue('amounts', expense.amount) : '',
  );
  const [spentOn, setSpentOn] = useState(() => expense?.spentOn ?? getTodayLocalDate());
  const [payerId, setPayerId] = useState(() => expense?.payerId ?? (me ?? view.people[0]?.id ?? ''));
  const [mode, setMode] = useState<SplitMode>(() => expense?.mode ?? 'equal');

  // Split states
  const [included, setIncluded] = useState<Set<string>>(() => {
    if (expense) {
      return new Set(expense.shares.map((s) => s.participantId));
    }
    return new Set(view.people.map((p) => p.id));
  });

  const [amountsInputs, setAmountsInputs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of view.people) init[p.id] = '';
    if (expense && expense.mode === 'amounts') {
      for (const s of expense.shares) {
        init[s.participantId] = fromEntryValue('amounts', s.inputValue);
      }
    }
    return init;
  });

  const [percentInputs, setPercentInputs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of view.people) init[p.id] = '';
    if (expense && expense.mode === 'percent') {
      for (const s of expense.shares) {
        init[s.participantId] = fromEntryValue('percent', s.inputValue);
      }
    }
    return init;
  });

  const [sharesInputs, setSharesInputs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of view.people) init[p.id] = '1';
    if (expense && expense.mode === 'shares') {
      for (const s of expense.shares) {
        init[s.participantId] = fromEntryValue('shares', s.inputValue);
      }
    }
    return init;
  });

  const [adjustInputs, setAdjustInputs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of view.people) init[p.id] = '0';
    if (expense && expense.mode === 'adjust') {
      for (const s of expense.shares) {
        init[s.participantId] = fromEntryValue('adjust', s.inputValue);
      }
    }
    return init;
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);

  const parsedAmount = useMemo(() => parseVnd(amountText), [amountText]);
  const isAmountInvalid = amountText.trim() !== '' && parsedAmount === null;

  const { entries, hasInvalidInput, inputErrors } = useMemo(() => {
    let invalid = false;
    const errors: Record<string, boolean> = {};
    const resultEntries: SplitEntry[] = [];

    for (const person of view.people) {
      const pId = person.id;
      if (mode === 'equal') {
        if (included.has(pId)) {
          resultEntries.push({ participantId: pId, value: 1 });
        }
      } else if (mode === 'adjust') {
        if (included.has(pId)) {
          const text = adjustInputs[pId] ?? '0';
          const trimmed = text.trim();
          const val = toEntryValue('adjust', trimmed);
          if (trimmed !== '' && val === null) {
            invalid = true;
            errors[pId] = true;
          } else {
            resultEntries.push({ participantId: pId, value: val ?? 0 });
          }
        }
      } else if (mode === 'amounts') {
        const text = amountsInputs[pId] ?? '';
        const trimmed = text.trim();
        if (trimmed !== '') {
          const val = toEntryValue('amounts', trimmed);
          if (val === null) {
            invalid = true;
            errors[pId] = true;
          } else if (val > 0) {
            resultEntries.push({ participantId: pId, value: val });
          }
        }
      } else if (mode === 'percent') {
        const text = percentInputs[pId] ?? '';
        const trimmed = text.trim();
        if (trimmed !== '') {
          const val = toEntryValue('percent', trimmed);
          if (val === null) {
            invalid = true;
            errors[pId] = true;
          } else if (val > 0) {
            resultEntries.push({ participantId: pId, value: val });
          }
        }
      } else if (mode === 'shares') {
        const text = sharesInputs[pId] ?? '';
        const trimmed = text.trim();
        if (trimmed !== '') {
          const val = toEntryValue('shares', trimmed);
          if (val === null) {
            invalid = true;
            errors[pId] = true;
          } else if (val > 0) {
            resultEntries.push({ participantId: pId, value: val });
          }
        }
      }
    }

    return { entries: resultEntries, hasInvalidInput: invalid, inputErrors: errors };
  }, [mode, included, adjustInputs, amountsInputs, percentInputs, sharesInputs, view.people]);

  const splitResult = useMemo(() => {
    if (parsedAmount === null) return null;
    return computeShares(parsedAmount, mode, entries);
  }, [parsedAmount, mode, entries]);

  const computedSharesMap = useMemo(() => {
    if (!splitResult || !splitResult.ok) return null;
    const map = new Map<string, number>();
    for (const s of splitResult.shares) {
      map.set(s.participantId, s.amount);
    }
    return map;
  }, [splitResult]);

  const isDescriptionValid = description.trim().length > 0;
  const isAmountValid = parsedAmount !== null;
  const isSplitValid = Boolean(splitResult?.ok && !hasInvalidInput);
  const isPayerValid = Boolean(payerId);

  const canSubmit = isDescriptionValid && isAmountValid && isSplitValid && isPayerValid;

  function formatSubmitError(err: unknown) {
    if (!err) return null;
    if (typeof err === 'object' && err !== null && 'code' in err) {
      const apiErr = err as { code: string; message?: string };
      if (apiErr.code === 'VALIDATION' && apiErr.message && SPLIT_ERRORS.has(apiErr.message)) {
        return {
          ...apiErr,
          message: t(`splitError.${apiErr.message as SplitError}` as MessageKey),
        };
      }
    }
    return err;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || isSubmitting || parsedAmount === null) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const body: ExpenseInput = {
      description: description.trim(),
      amount: parsedAmount,
      spentOn,
      payerId,
      mode,
      entries,
    };

    try {
      if (isEdit && expenseId) {
        await apiSend(`/api/trips/${tripId}/expenses/${expenseId}`, 'PATCH', body, tripId);
      } else {
        await apiSend(`/api/trips/${tripId}/expenses`, 'POST', body, tripId);
      }
      await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
      navigate(`/t/${tripId}`);
    } catch (err) {
      setSubmitError(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  const submitText = isEdit
    ? t('expenseForm.save')
    : view.me.kind === 'guest'
      ? t('expense.sendForApproval')
      : t('expenseForm.add');

  return (
    <form onSubmit={handleSubmit} className="fsl-expense-form">
      <div className="fsl-field">
        <label htmlFor="expense-what-for" className="fsl-field-label">
          {t('expenseForm.whatFor')}
        </label>
        <input
          id="expense-what-for"
          type="text"
          className="fsl-input"
          placeholder={t('expenseForm.whatForPlaceholder')}
          maxLength={80}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="fsl-field">
        <label htmlFor="expense-amount" className="fsl-field-label">
          {t('expenseForm.amount')}
        </label>
        <input
          id="expense-amount"
          type="text"
          inputMode="decimal"
          className="fsl-input fsl-input--amount"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          aria-describedby={isAmountInvalid ? 'expense-amount-error' : 'expense-amount-hint'}
        />
        {parsedAmount !== null && (
          <div className="fsl-amount-preview">
            {formatVnd(parsedAmount)}
          </div>
        )}
        {isAmountInvalid ? (
          <div id="expense-amount-error" role="alert" className="fsl-field-error">
            {t('expenseForm.amountInvalid')}
          </div>
        ) : (
          <div id="expense-amount-hint" className="fsl-field-hint">
            {t('expenseForm.amountHint')}
          </div>
        )}
      </div>

      <div className="fsl-field">
        <label htmlFor="expense-date" className="fsl-field-label">
          {t('expenseForm.date')}
        </label>
        <input
          id="expense-date"
          type="date"
          className="fsl-input"
          value={spentOn}
          onChange={(e) => setSpentOn(e.target.value)}
        />
      </div>

      <div className="fsl-field">
        <label htmlFor="expense-paid-by" className="fsl-field-label">
          {t('expenseForm.paidBy')}
        </label>
        <select
          id="expense-paid-by"
          className="fsl-select"
          value={payerId}
          onChange={(e) => setPayerId(e.target.value)}
        >
          {view.people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.id === me
                ? t('expenseForm.me', { name: person.name })
                : person.name}
            </option>
          ))}
        </select>
      </div>

      <div className="fsl-expense-form__split-section">
        <h2 className="fsl-section-heading">{t('expenseForm.split')}</h2>

        <div role="tablist" aria-label={t('expenseForm.split')} className="fsl-split-tabs">
          {SPLIT_MODES.map(({ mode: m, labelKey }) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={`fsl-split-tab ${mode === m ? 'fsl-split-tab--active' : ''}`}
              onClick={() => setMode(m)}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>

        <div className="fsl-card">
          {view.people.map((person) => {
            const shareAmount = computedSharesMap?.get(person.id);
            const isIncluded = included.has(person.id);
            const isInputInvalid = Boolean(inputErrors[person.id]);

            return (
              <div
                key={person.id}
                className="fsl-split-row"
                data-testid={`split-row-${person.name}`}
              >
                {(mode === 'equal' || mode === 'adjust') && (
                  <label className="fsl-split-row__check-label">
                    <input
                      type="checkbox"
                      className="fsl-split-row__checkbox"
                      aria-label={t('expenseForm.include', { name: person.name })}
                      checked={isIncluded}
                      onChange={(e) => {
                        const next = new Set(included);
                        if (e.target.checked) next.add(person.id);
                        else next.delete(person.id);
                        setIncluded(next);
                      }}
                    />
                  </label>
                )}

                <Avatar name={person.name} size="sm" />

                <span className="fsl-split-row__name">
                  {person.id === me
                    ? t('expenseForm.me', { name: person.name })
                    : person.name}
                </span>

                {mode === 'adjust' && (
                  <div className="fsl-split-row__control">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="fsl-input fsl-split-row__input"
                      aria-label={t('expenseForm.adjustFor', { name: person.name })}
                      value={adjustInputs[person.id] ?? '0'}
                      disabled={!isIncluded}
                      onChange={(e) =>
                        setAdjustInputs((prev) => ({
                          ...prev,
                          [person.id]: e.target.value,
                        }))
                      }
                    />
                    {isInputInvalid && (
                      <span role="alert" className="fsl-field-error">
                        {t('expenseForm.amountInvalid')}
                      </span>
                    )}
                  </div>
                )}

                {mode === 'amounts' && (
                  <div className="fsl-split-row__control">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="fsl-input fsl-split-row__input"
                      aria-label={t('expenseForm.amountFor', { name: person.name })}
                      value={amountsInputs[person.id] ?? ''}
                      placeholder="0"
                      onChange={(e) =>
                        setAmountsInputs((prev) => ({
                          ...prev,
                          [person.id]: e.target.value,
                        }))
                      }
                    />
                    {isInputInvalid && (
                      <span role="alert" className="fsl-field-error">
                        {t('expenseForm.amountInvalid')}
                      </span>
                    )}
                  </div>
                )}

                {mode === 'percent' && (
                  <div className="fsl-split-row__control">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="fsl-input fsl-split-row__input"
                      aria-label={t('expenseForm.percentFor', { name: person.name })}
                      value={percentInputs[person.id] ?? ''}
                      placeholder="0"
                      onChange={(e) =>
                        setPercentInputs((prev) => ({
                          ...prev,
                          [person.id]: e.target.value,
                        }))
                      }
                    />
                    {isInputInvalid && (
                      <span role="alert" className="fsl-field-error">
                        {t('expenseForm.amountInvalid')}
                      </span>
                    )}
                  </div>
                )}

                {mode === 'shares' && (
                  <div className="fsl-split-row__control">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="fsl-input fsl-split-row__input"
                      aria-label={t('expenseForm.sharesFor', { name: person.name })}
                      value={sharesInputs[person.id] ?? '1'}
                      placeholder="1"
                      onChange={(e) =>
                        setSharesInputs((prev) => ({
                          ...prev,
                          [person.id]: e.target.value,
                        }))
                      }
                    />
                    {isInputInvalid && (
                      <span role="alert" className="fsl-field-error">
                        {t('expenseForm.amountInvalid')}
                      </span>
                    )}
                  </div>
                )}

                {shareAmount !== undefined && (
                  <span className="fsl-split-row__share">
                    {formatVnd(shareAmount)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {parsedAmount !== null && splitResult && !splitResult.ok && (
          <div role="alert" className="fsl-split-error">
            {t(`splitError.${splitResult.error}` as MessageKey)}
          </div>
        )}
      </div>

      <div className="fsl-expense-form__actions">
        {submitError ? (
          <InlineError
            error={formatSubmitError(submitError)}
            className="fsl-expense-form__submit-error"
          />
        ) : null}

        <Button
          type="submit"
          variant="primary"
          block
          loading={isSubmitting}
          disabled={!canSubmit || isSubmitting}
        >
          {submitText}
        </Button>

        {view.me.kind === 'guest' && (
          <p className="fsl-expense-form__guest-note">
            {t('expenseForm.guestNote')}
          </p>
        )}
      </div>
    </form>
  );
}

export function ExpenseForm() {
  const { tripId = '', expenseId } = useParams<{ tripId: string; expenseId?: string }>();
  const t = useT();
  const { view, error: tripError, isLoading, refetch } = useTripView(tripId, 0);

  const isEdit = Boolean(expenseId);
  const title = isEdit ? t('expenseForm.titleEdit') : t('expenseForm.titleNew');
  const back = `/t/${tripId}`;

  if (isLoading || !view) {
    return (
      <Screen title={title} back={back}>
        <div className="fsl-expense-form">
          <div className="fsl-field">
            <Skeleton width="30%" height={14} />
            <Skeleton width="100%" height={44} radius="md" />
          </div>
          <div className="fsl-field">
            <Skeleton width="20%" height={14} />
            <Skeleton width="100%" height={56} radius="md" />
          </div>
          <div className="fsl-field">
            <Skeleton width="20%" height={14} />
            <Skeleton width="100%" height={44} radius="md" />
          </div>
          <div className="fsl-field">
            <Skeleton width="25%" height={14} />
            <Skeleton width="100%" height={44} radius="md" />
          </div>
          <div className="fsl-expense-form__split-section">
            <Skeleton width="20%" height={14} />
            <Skeleton width="100%" height={44} radius="md" />
            <SkeletonList rows={4} />
          </div>
          <Skeleton width="100%" height={48} radius="md" />
        </div>
      </Screen>
    );
  }

  if (tripError) {
    return (
      <Screen title={title} back={back}>
        <div className="fsl-expense-form">
          <InlineError error={tripError} onRetry={refetch} />
        </div>
      </Screen>
    );
  }

  const expense = expenseId ? view.expenses.find((e) => e.id === expenseId) : undefined;
  if (expenseId && !expense) {
    return (
      <Screen title={title} back={back}>
        <div className="fsl-expense-form">
          <InlineError error={{ code: 'NOT_FOUND' }} />
        </div>
      </Screen>
    );
  }

  return (
    <Screen title={title} back={back}>
      <ExpenseFormContent
        view={view}
        tripId={tripId}
        expenseId={expenseId}
        expense={expense}
      />
    </Screen>
  );
}
