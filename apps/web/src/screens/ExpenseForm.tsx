import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type {
  TripView,
  ExpenseView,
  ExpenseInput,
  SplitMode,
  SplitEntry,
  SplitError,
  SplitResult,
  SportParticipantEntry,
  SportRule,
} from '@fsl/core';
import { can, computeShares, computeSportShares, formatVnd, parseVnd } from '@fsl/core';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n/en';
import { useTripView } from '../api/hooks';
import { apiSend } from '../api/client';
import { toEntryValue, fromEntryValue } from '../lib/splitInput';
import { useLeaveForm } from '../lib/detailsNav';
import { actorOf } from '../lib/rowActions';
import { SplitModePicker } from '../components/SplitModePicker';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { Avatar } from '../components/Avatar';
import { InlineError } from '../components/InlineError';
import { Skeleton, SkeletonList } from '../components/Skeleton';
import { Icon } from '../components/icons';
import './ExpenseForm.css';

function getTodayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type T = ReturnType<typeof useT>;

/**
 * The line under the split picker: the mode in words, how many people it counts and the result so far. An equal
 * split says what each pays; exact amounts and percentages say what is left (or over) until they add up.
 * `total` is the amount being split (null until it is typed); `assigned` is the sum of the values typed (hundredths of a
 * percent for percentages, dong for exact amounts).
 */
function splitCaption(
  t: T,
  mode: SplitMode,
  people: number,
  result: SplitResult | null,
  total: number | null,
  assigned: number,
): string {
  switch (mode) {
    case 'equal': {
      if (!result || !result.ok) return t('split.captionEqualNone', { n: people });
      // The few dong that do not divide evenly make some shares one more than the rest: the line gives the smallest.
      const each = Math.min(...result.shares.map((s) => s.amount));
      const allEqual = result.shares.every((s) => s.amount === each);
      return t(allEqual ? 'split.captionEqual' : 'split.captionEqualAbout', { n: people, each: formatVnd(each) });
    }
    case 'amounts': {
      const left = total === null ? 0 : total - assigned;
      if (left === 0) return t('split.captionExact', { n: people });
      return t(left > 0 ? 'split.captionExactLeft' : 'split.captionExactOver', { n: people, amount: formatVnd(Math.abs(left)) });
    }
    case 'percent': {
      const left = 10000 - assigned;
      if (left === 0) return t('split.captionPercent', { n: people });
      return t(left > 0 ? 'split.captionPercentLeft' : 'split.captionPercentOver', {
        n: people,
        pct: fromEntryValue('percent', Math.abs(left)),
      });
    }
    case 'shares':
      return t('split.captionShares', { n: people });
    case 'adjust':
      return t('split.captionAdjust', { n: people });
  }
}

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
  title: string;
  leave: () => void;
}

interface ShuttleRow {
  qty: string;
  unitPrice: string;
}

interface SportSlotState {
  femaleSlotsText: string;
  maleSlotsText: string;
  fixedText: string;
}

function ExpenseFormContent({ view, tripId, expenseId, expense, title, leave }: ExpenseFormContentProps) {
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

  // Sport mode toggle
  const [sportSelected, setSportSelected] = useState<boolean>(() => {
    return Boolean(expense?.meta?.sport) || (!isEdit && view.trip.preset === 'sport');
  });

  // Sport Session Costs
  const [courtText, setCourtText] = useState(() => {
    if (expense?.meta?.sport?.court !== undefined && expense.meta.sport.court > 0) {
      return fromEntryValue('amounts', expense.meta.sport.court);
    }
    return '';
  });

  const [shuttleRows, setShuttleRows] = useState<ShuttleRow[]>(() => {
    if (expense?.meta?.sport?.shuttlecocks && expense.meta.sport.shuttlecocks.length > 0) {
      return expense.meta.sport.shuttlecocks.slice(0, 3).map((r) => ({
        qty: String(r.qty),
        unitPrice: fromEntryValue('amounts', r.unitPrice),
      }));
    }
    return [{ qty: '1', unitPrice: '' }];
  });

  const [extraText, setExtraText] = useState(() => {
    if (expense?.meta?.sport?.extra !== undefined && expense.meta.sport.extra > 0) {
      return fromEntryValue('amounts', expense.meta.sport.extra);
    }
    return '';
  });

  // Men / Women Rule
  const [ruleKind, setRuleKind] = useState<'equal' | 'discount' | 'ratio'>(() => {
    if (expense?.meta?.sport?.rule) {
      return expense.meta.sport.rule.kind;
    }
    return 'discount';
  });

  const [discountText, setDiscountText] = useState(() => {
    if (expense?.meta?.sport?.rule?.kind === 'discount' && expense.meta.sport.rule.femaleDiscount > 0) {
      return fromEntryValue('amounts', expense.meta.sport.rule.femaleDiscount);
    }
    return '';
  });

  const [maleWeightText, setMaleWeightText] = useState(() => {
    if (expense?.meta?.sport?.rule?.kind === 'ratio') {
      return String(expense.meta.sport.rule.maleWeight / 100);
    }
    return '1';
  });

  const [femaleWeightText, setFemaleWeightText] = useState(() => {
    if (expense?.meta?.sport?.rule?.kind === 'ratio') {
      return String(expense.meta.sport.rule.femaleWeight / 100);
    }
    return '0.75';
  });

  const sportRule: SportRule = useMemo(() => {
    if (ruleKind === 'equal') {
      return { kind: 'equal' };
    }
    if (ruleKind === 'discount') {
      const d = parseVnd(discountText) || 0;
      return { kind: 'discount', femaleDiscount: d };
    }
    const mw = Math.round((parseFloat(maleWeightText) || 1) * 100);
    const fw = Math.round((parseFloat(femaleWeightText) || 0.75) * 100);
    return { kind: 'ratio', maleWeight: mw > 0 ? mw : 100, femaleWeight: fw > 0 ? fw : 75 };
  }, [ruleKind, discountText, maleWeightText, femaleWeightText]);

  // Sport Participant Slots
  const [sportSlots, setSportSlots] = useState<Record<string, SportSlotState>>(() => {
    const init: Record<string, SportSlotState> = {};
    const metaEntries = expense?.meta?.sport?.entries;
    const metaMap = metaEntries ? new Map(metaEntries.map((e) => [e.participantId, e])) : null;

    for (const person of view.people) {
      const metaEntry = metaMap?.get(person.id);
      if (metaEntry) {
        init[person.id] = {
          femaleSlotsText: String(metaEntry.femaleSlots),
          maleSlotsText: String(metaEntry.maleSlots),
          fixedText:
            metaEntry.fixedAmount !== undefined && metaEntry.fixedAmount !== null
              ? fromEntryValue('amounts', metaEntry.fixedAmount)
              : '',
        };
      } else {
        init[person.id] = {
          femaleSlotsText: person.gender === 'F' ? '1' : '0',
          maleSlotsText: person.gender === 'F' ? '0' : '1',
          fixedText: '',
        };
      }
    }
    return init;
  });

  const [openDrawerId, setOpenDrawerId] = useState<string | null>(null);

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

  const parsedCourt = useMemo(() => parseVnd(courtText) || 0, [courtText]);
  const parsedExtra = useMemo(() => parseVnd(extraText) || 0, [extraText]);

  const { parsedShuttlecocks, shuttlecocksTotal } = useMemo(() => {
    const active: { qty: number; unitPrice: number }[] = [];
    let sum = 0;
    for (const row of shuttleRows) {
      const qty = parseInt(row.qty, 10) || 0;
      const unitPrice = parseVnd(row.unitPrice) || 0;
      if (qty > 0 && unitPrice > 0) {
        active.push({ qty, unitPrice });
        sum += qty * unitPrice;
      }
    }
    return { parsedShuttlecocks: active, shuttlecocksTotal: sum };
  }, [shuttleRows]);

  const sportTotal = useMemo(() => {
    return parsedCourt + shuttlecocksTotal + parsedExtra;
  }, [parsedCourt, shuttlecocksTotal, parsedExtra]);

  const { sportEntries, totalMaleSlots, totalFemaleSlots } = useMemo(() => {
    let mTotal = 0;
    let fTotal = 0;
    const list: SportParticipantEntry[] = [];

    for (const person of view.people) {
      if (!included.has(person.id)) continue;
      const slot = sportSlots[person.id] ?? {
        femaleSlotsText: person.gender === 'F' ? '1' : '0',
        maleSlotsText: person.gender === 'F' ? '0' : '1',
        fixedText: '',
      };
      const fSlots = Math.max(0, parseInt(slot.femaleSlotsText, 10) || 0);
      const mSlots = Math.max(0, parseInt(slot.maleSlotsText, 10) || 0);
      const fixed = slot.fixedText.trim() !== '' ? parseVnd(slot.fixedText) : null;

      if (fixed === null) {
        mTotal += mSlots;
        fTotal += fSlots;
      }

      if (fixed !== null || mSlots + fSlots > 0) {
        const entry: SportParticipantEntry = {
          participantId: person.id,
          maleSlots: mSlots,
          femaleSlots: fSlots,
        };
        if (fixed !== null) {
          entry.fixedAmount = fixed;
        }
        list.push(entry);
      }
    }

    return { sportEntries: list, totalMaleSlots: mTotal, totalFemaleSlots: fTotal };
  }, [view.people, included, sportSlots]);

  const sportResult = useMemo(() => {
    if (!sportSelected) return null;
    if (sportTotal <= 0) return null;
    return computeSportShares(sportTotal, sportRule, sportEntries);
  }, [sportSelected, sportTotal, sportRule, sportEntries]);

  const splitResult = useMemo(() => {
    if (sportSelected) return null;
    if (parsedAmount === null) return null;
    return computeShares(parsedAmount, mode, entries);
  }, [sportSelected, parsedAmount, mode, entries]);

  // Percent and exact amounts have no ticks: until someone is given a value, everyone listed is still to be given one.
  const captionPeople = (mode === 'amounts' || mode === 'percent') && entries.length === 0 ? view.people.length : entries.length;
  const assigned = entries.reduce((sum, e) => sum + e.value, 0);
  const caption = splitCaption(t, mode, captionPeople, splitResult, parsedAmount, assigned);

  // Each person's share as the amount and the split are typed. Once the split adds up it is core's result (which
  // places the leftover dong); before that, exact amounts are what was typed and a percentage is its part of the
  // total rounded to whole dong, so the rows follow every keystroke in every mode.
  const liveShares = useMemo(() => {
    const map = new Map<string, number>();
    if (sportSelected) {
      if (sportResult?.ok) {
        for (const s of sportResult.shares) map.set(s.participantId, s.amount);
      }
      return map;
    }
    if (splitResult?.ok) {
      for (const s of splitResult.shares) map.set(s.participantId, s.amount);
    } else if (mode === 'amounts') {
      for (const e of entries) map.set(e.participantId, e.value);
    } else if (mode === 'percent' && parsedAmount !== null) {
      for (const e of entries) {
        const share = Math.round((parsedAmount * e.value) / 10000);
        if (Number.isSafeInteger(share)) map.set(e.participantId, share);
      }
    }
    return map;
  }, [sportSelected, sportResult, splitResult, mode, entries, parsedAmount]);

  const isDescriptionValid = description.trim().length > 0;
  const isPayerValid = Boolean(payerId);
  const isAmountValid = parsedAmount !== null;
  const isSplitValid = Boolean(splitResult?.ok && !hasInvalidInput);

  const isSportAmountValid = sportTotal > 0;
  const isSportSplitValid = Boolean(sportResult?.ok);

  const canSubmit =
    isDescriptionValid &&
    isPayerValid &&
    (sportSelected ? isSportAmountValid && isSportSplitValid : isAmountValid && isSplitValid);

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
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      if (sportSelected) {
        if (!sportResult || !sportResult.ok || sportTotal <= 0) return;
        const body: ExpenseInput = {
          description: description.trim(),
          amount: sportTotal,
          spentOn,
          payerId,
          mode: 'amounts',
          entries: sportResult.shares.map((s) => ({
            participantId: s.participantId,
            value: s.amount,
          })),
          meta: {
            sport: {
              court: parsedCourt,
              shuttlecocks: parsedShuttlecocks,
              extra: parsedExtra,
              rule: sportRule,
              entries: sportEntries,
              maleSlotRate: sportResult.maleSlotRate,
              femaleSlotRate: sportResult.femaleSlotRate,
            },
          },
        };

        if (isEdit && expenseId) {
          await apiSend(`/api/trips/${tripId}/expenses/${expenseId}`, 'PATCH', body, tripId);
          await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
          leave();
        } else {
          const res = await apiSend<{ expenseId: string }>(`/api/trips/${tripId}/expenses`, 'POST', body, tripId);
          await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
          navigate(`/t/${tripId}/expenses/${res.expenseId}`, { replace: true });
        }
      } else {
        if (parsedAmount === null) return;
        const body: ExpenseInput = {
          description: description.trim(),
          amount: parsedAmount,
          spentOn,
          payerId,
          mode,
          entries,
        };

        if (isEdit && expenseId) {
          await apiSend(`/api/trips/${tripId}/expenses/${expenseId}`, 'PATCH', body, tripId);
        } else {
          await apiSend(`/api/trips/${tripId}/expenses`, 'POST', body, tripId);
        }
        await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
        leave();
      }
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
    <Screen
      title={title}
      onBack={leave}
      bottomBar={
        <>
          {submitError ? <InlineError error={formatSubmitError(submitError)} /> : null}
          <Button
            type="submit"
            form="expense-form"
            variant="primary"
            block
            loading={isSubmitting}
            disabled={!canSubmit || isSubmitting}
          >
            {submitText}
          </Button>
        </>
      }
    >
      <form
        id="expense-form"
        onSubmit={handleSubmit}
        className={`fsl-expense-form${submitError ? ' fsl-expense-form--bar-error' : ''}`}
      >
        <div className="fsl-field">
          <label htmlFor="expense-what-for" className="fsl-field-label">
            {t('expenseForm.whatFor')}
          </label>
          <input
            id="expense-what-for"
            type="text"
            className="fsl-input"
            placeholder={sportSelected ? t('sport.whatForPlaceholder') : t('expenseForm.whatForPlaceholder')}
            maxLength={80}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {sportSelected ? (
          <div className="fsl-sport-costs-card">
            <h3 className="fsl-sport-costs-title">{t('sport.costsTitle')}</h3>

            <div className="fsl-field">
              <label htmlFor="sport-court" className="fsl-field-label">
                {t('sport.court')}
              </label>
              <input
                id="sport-court"
                type="text"
                inputMode="decimal"
                className="fsl-input fsl-input--amount"
                placeholder="0"
                value={courtText}
                onChange={(e) => setCourtText(e.target.value)}
              />
              {parsedCourt > 0 && (
                <div className="fsl-amount-preview">
                  {formatVnd(parsedCourt)}
                </div>
              )}
            </div>

            <div className="fsl-sport-shuttle-section">
              <span className="fsl-field-label">{t('sport.shuttlecocks')}</span>
              {shuttleRows.map((row, idx) => {
                const qty = parseInt(row.qty, 10) || 0;
                const unitPrice = parseVnd(row.unitPrice) || 0;
                const subtotal = qty * unitPrice;

                return (
                  <div key={idx} className="fsl-shuttle-row">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="fsl-input fsl-input--qty"
                      aria-label={t('sport.qty')}
                      placeholder="1"
                      value={row.qty}
                      onChange={(e) => {
                        const val = e.target.value;
                        setShuttleRows((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, qty: val } : r)),
                        );
                      }}
                    />
                    <span className="fsl-shuttle-times" aria-hidden="true">×</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="fsl-input fsl-input--unit-price"
                      aria-label={t('sport.unitPrice')}
                      placeholder="26.67k"
                      value={row.unitPrice}
                      onChange={(e) => {
                        const val = e.target.value;
                        setShuttleRows((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, unitPrice: val } : r)),
                        );
                      }}
                    />
                    <span className="fsl-shuttle-subtotal">
                      {formatVnd(subtotal)}
                    </span>
                    {shuttleRows.length > 1 && (
                      <button
                        type="button"
                        className="fsl-shuttle-remove"
                        aria-label={t('sport.removeShuttleRow', { n: idx + 1 })}
                        onClick={() => {
                          setShuttleRows((rows) => rows.filter((_, i) => i !== idx));
                        }}
                      >
                        <Icon name="x" size={16} />
                      </button>
                    )}
                  </div>
                );
              })}

              {shuttleRows.length < 3 && (
                <button
                  type="button"
                  className="fsl-shuttle-add-btn"
                  onClick={() => {
                    setShuttleRows((rows) => [...rows, { qty: '1', unitPrice: '' }]);
                  }}
                >
                  {t('sport.addShuttlePrice')}
                </button>
              )}
            </div>

            <div className="fsl-field">
              <label htmlFor="sport-extra" className="fsl-field-label">
                {t('sport.extra')}
              </label>
              <input
                id="sport-extra"
                type="text"
                inputMode="decimal"
                className="fsl-input"
                placeholder="0"
                value={extraText}
                onChange={(e) => setExtraText(e.target.value)}
              />
              {parsedExtra > 0 && (
                <div className="fsl-amount-preview">
                  {formatVnd(parsedExtra)}
                </div>
              )}
            </div>

            <div className="fsl-sport-total-bar">
              <span className="fsl-sport-total-bar__slots">
                {t('sport.totalBar', {
                  slots: totalMaleSlots + totalFemaleSlots,
                  f: totalFemaleSlots,
                  m: totalMaleSlots,
                })}
              </span>
              <span className="fsl-sport-total-bar__total">
                <span className="fsl-sport-total-bar__label">{t('sport.totalLabel')}:</span>{' '}
                <strong>{formatVnd(sportTotal)}</strong>
              </span>
            </div>
          </div>
        ) : (
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
        )}

        <div className="fsl-expense-form__row">
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
        </div>

        <div className="fsl-expense-form__split-section">
          <h2 className="fsl-section-heading">{t('expenseForm.split')}</h2>

          <SplitModePicker
            value={mode}
            onChange={(m) => {
              setSportSelected(false);
              setMode(m);
            }}
            showSport={view.trip.preset === 'sport' || Boolean(expense?.meta?.sport)}
            sportSelected={sportSelected}
            onSelectSport={() => setSportSelected(true)}
          />

          {sportSelected ? (
            <div className="fsl-sport-rule-section">
              <div
                role="radiogroup"
                aria-label={t('sport.ruleTitle')}
                className="fsl-sport-rule-picker"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={ruleKind === 'equal'}
                  className={`fsl-sport-rule-btn${ruleKind === 'equal' ? ' fsl-sport-rule-btn--active' : ''}`}
                  onClick={() => setRuleKind('equal')}
                >
                  <span aria-hidden="true">=</span>
                  <span>{t('sport.ruleEqual')}</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={ruleKind === 'discount'}
                  className={`fsl-sport-rule-btn${ruleKind === 'discount' ? ' fsl-sport-rule-btn--active' : ''}`}
                  onClick={() => setRuleKind('discount')}
                >
                  <span aria-hidden="true">+/−</span>
                  <span>{t('sport.ruleDiscount')}</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={ruleKind === 'ratio'}
                  className={`fsl-sport-rule-btn${ruleKind === 'ratio' ? ' fsl-sport-rule-btn--active' : ''}`}
                  onClick={() => setRuleKind('ratio')}
                >
                  <Icon name="pie" size={16} />
                  <span>{t('sport.ruleRatio')}</span>
                </button>
              </div>

              {ruleKind === 'discount' && (
                <div className="fsl-sport-rule-input-row">
                  <Icon name="venus" size={16} className="fsl-sport-rule-icon--female" />
                  <label htmlFor="sport-female-discount" className="fsl-sport-rule-label">
                    {t('sport.femaleDiscountLabel')}
                  </label>
                  <input
                    id="sport-female-discount"
                    type="text"
                    inputMode="decimal"
                    placeholder="15k"
                    className="fsl-input fsl-input--discount"
                    value={discountText}
                    onChange={(e) => setDiscountText(e.target.value)}
                  />
                </div>
              )}

              {ruleKind === 'ratio' && (
                <div className="fsl-sport-rule-input-row">
                  <Icon name="mars" size={16} className="fsl-sport-rule-icon--male" />
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label={t('sport.maleWeightLabel')}
                    className="fsl-input fsl-input--ratio"
                    value={maleWeightText}
                    onChange={(e) => setMaleWeightText(e.target.value)}
                  />
                  <span aria-hidden="true">:</span>
                  <Icon name="venus" size={16} className="fsl-sport-rule-icon--female" />
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label={t('sport.femaleWeightLabel')}
                    className="fsl-input fsl-input--ratio"
                    value={femaleWeightText}
                    onChange={(e) => setFemaleWeightText(e.target.value)}
                  />
                </div>
              )}

              <div className="fsl-sport-slot-summary">
                {t('sport.slotSummary', {
                  m: formatVnd(sportResult?.ok ? sportResult.maleSlotRate : 0),
                  f: formatVnd(sportResult?.ok ? sportResult.femaleSlotRate : 0),
                })}
              </div>
            </div>
          ) : (
            <p className="fsl-split-caption">{caption}</p>
          )}

          {sportSelected && sportResult && !sportResult.ok && (
            <div role="alert" className="fsl-split-error">
              {t(`splitError.${sportResult.error}` as MessageKey)}
            </div>
          )}

          <div className="fsl-card">
            {view.people.map((person) => {
              const shareAmount = liveShares.get(person.id);
              const isIncluded = included.has(person.id);
              const isInputInvalid = Boolean(inputErrors[person.id]);

              if (sportSelected) {
                const slot = sportSlots[person.id] ?? {
                  femaleSlotsText: person.gender === 'F' ? '1' : '0',
                  maleSlotsText: person.gender === 'F' ? '0' : '1',
                  fixedText: '',
                };
                const isFixed = slot.fixedText.trim() !== '';
                const mSlots = slot.maleSlotsText || '0';
                const fSlots = slot.femaleSlotsText || '0';

                return (
                  <div
                    key={person.id}
                    className="fsl-split-row fsl-split-row--sport"
                    data-testid={`split-row-${person.name}`}
                  >
                    <div className="fsl-split-row__main">
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
                      <Avatar name={person.name} size="sm" />
                      <span className="fsl-split-row__name">
                        {person.id === me
                          ? t('expenseForm.me', { name: person.name })
                          : person.name}
                      </span>

                      {isFixed ? (
                        <span className="fsl-sport-badge">{t('sport.fixedBadge')}</span>
                      ) : mSlots === '1' && fSlots === '0' ? (
                        <span className="fsl-sport-badge">{t('sport.oneMale')}</span>
                      ) : fSlots === '1' && mSlots === '0' ? (
                        <span className="fsl-sport-badge">{t('sport.oneFemale')}</span>
                      ) : (
                        <span className="fsl-sport-badge">
                          {t('sport.slotsBadge', { f: fSlots, m: mSlots })}
                        </span>
                      )}

                      <button
                        type="button"
                        className="fsl-sport-share-btn"
                        data-testid={`sport-share-btn-${person.id}`}
                        aria-expanded={openDrawerId === person.id}
                        onClick={() =>
                          setOpenDrawerId(openDrawerId === person.id ? null : person.id)
                        }
                      >
                        <span>{formatVnd(shareAmount ?? 0)}</span>
                        <Icon name="edit" size={14} />
                      </button>
                    </div>

                    {openDrawerId === person.id && isIncluded && (
                      <div className="fsl-sport-drawer">
                        <div className="fsl-sport-drawer__slots">
                          <div className="fsl-sport-drawer__slot-field">
                            <Icon name="venus" size={16} />
                            <label htmlFor={`sport-fslots-${person.id}`} className="fsl-sr-only">
                              {t('sport.femaleSlotsFor', { name: person.name })}
                            </label>
                            <input
                              id={`sport-fslots-${person.id}`}
                              type="number"
                              min={0}
                              max={20}
                              aria-label={t('sport.femaleSlotsFor', { name: person.name })}
                              className="fsl-input fsl-input--slot"
                              value={slot.femaleSlotsText}
                              onChange={(e) => {
                                const val = e.target.value;
                                setSportSlots((prev) => ({
                                  ...prev,
                                  [person.id]: { ...prev[person.id]!, femaleSlotsText: val },
                                }));
                              }}
                            />
                          </div>

                          <div className="fsl-sport-drawer__slot-field">
                            <Icon name="mars" size={16} />
                            <label htmlFor={`sport-mslots-${person.id}`} className="fsl-sr-only">
                              {t('sport.maleSlotsFor', { name: person.name })}
                            </label>
                            <input
                              id={`sport-mslots-${person.id}`}
                              type="number"
                              min={0}
                              max={20}
                              aria-label={t('sport.maleSlotsFor', { name: person.name })}
                              className="fsl-input fsl-input--slot"
                              value={slot.maleSlotsText}
                              onChange={(e) => {
                                const val = e.target.value;
                                setSportSlots((prev) => ({
                                  ...prev,
                                  [person.id]: { ...prev[person.id]!, maleSlotsText: val },
                                }));
                              }}
                            />
                          </div>

                          {mSlots === '1' && fSlots === '0' && (
                            <button
                              type="button"
                              className="fsl-sport-drawer__quick-btn"
                              onClick={() => {
                                setSportSlots((prev) => ({
                                  ...prev,
                                  [person.id]: {
                                    ...prev[person.id]!,
                                    maleSlotsText: '0',
                                    femaleSlotsText: '1',
                                  },
                                }));
                              }}
                            >
                              {t('sport.sameAsFemale')}
                            </button>
                          )}
                        </div>

                        <div className="fsl-sport-drawer__fixed">
                          <label htmlFor={`sport-fixed-${person.id}`} className="fsl-sr-only">
                            {t('sport.fixedFor', { name: person.name })}
                          </label>
                          <input
                            id={`sport-fixed-${person.id}`}
                            type="text"
                            inputMode="decimal"
                            aria-label={t('sport.fixedFor', { name: person.name })}
                            placeholder={t('sport.fixedFor', { name: person.name })}
                            className="fsl-input fsl-input--fixed"
                            value={slot.fixedText}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSportSlots((prev) => ({
                                ...prev,
                                [person.id]: { ...prev[person.id]!, fixedText: val },
                              }));
                            }}
                          />
                          {slot.fixedText !== '' && (
                            <button
                              type="button"
                              className="fsl-sport-drawer__clear-btn"
                              aria-label={t('sport.clearFixed', { name: person.name })}
                              onClick={() => {
                                setSportSlots((prev) => ({
                                  ...prev,
                                  [person.id]: { ...prev[person.id]!, fixedText: '' },
                                }));
                              }}
                            >
                              <Icon name="x" size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

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

          {!sportSelected && parsedAmount !== null && splitResult && !splitResult.ok && (
            <div role="alert" className="fsl-split-error">
              {t(`splitError.${splitResult.error}` as MessageKey)}
            </div>
          )}
        </div>

        {view.me.kind === 'guest' && (
          <p className="fsl-expense-form__guest-note">
            {t('expenseForm.guestNote')}
          </p>
        )}
      </form>
    </Screen>
  );
}

export function ExpenseForm() {
  const { tripId = '', expenseId } = useParams<{ tripId: string; expenseId?: string }>();
  const t = useT();
  const leave = useLeaveForm(tripId);
  const { view, error: tripError, isLoading, refetch } = useTripView(tripId, 0);

  const isEdit = Boolean(expenseId);
  const title = isEdit ? t('expenseForm.titleEdit') : t('expenseForm.titleNew');

  if (isLoading || !view) {
    return (
      <Screen title={title} onBack={leave}>
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
      <Screen title={title} onBack={leave}>
        <div className="fsl-expense-form">
          <InlineError error={tripError} onRetry={refetch} />
        </div>
      </Screen>
    );
  }

  const expense = expenseId ? view.expenses.find((e) => e.id === expenseId) : undefined;
  if (expenseId && !expense) {
    return (
      <Screen title={title} onBack={leave}>
        <div className="fsl-expense-form">
          <InlineError error={{ code: 'NOT_FOUND' }} />
        </div>
      </Screen>
    );
  }

  if (expense && !can(actorOf(view), 'edit_expense', { expenseCreatedById: expense.createdById, expenseStatus: expense.status })) {
    return (
      <Screen title={title} onBack={leave}>
        <div className="fsl-expense-form">
          <p className="fsl-expense-form__not-yours">{t('expense.notYours')}</p>
          <Button variant="secondary" onClick={leave}>{t('common.back')}</Button>
        </div>
      </Screen>
    );
  }

  return (
    <ExpenseFormContent
      view={view}
      tripId={tripId}
      expenseId={expenseId}
      expense={expense}
      title={title}
      leave={leave}
    />
  );
}
