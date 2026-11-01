import { useState, useMemo, type ReactNode } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router';
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
import { can, computeShares, computeSportShares, formatVnd, isFundPaid, parseVnd } from '@fsl/core';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n/en';
import { useTripView } from '../api/hooks';
import { useTrip } from '../lib/tripBase';
import { apiSend, ApiClientError } from '../api/client';
import { useGroupPeople, importPerson } from '../api/people';
import { readSplitInput, fromEntryValue } from '../lib/splitInput';
import { recentGroups } from '../lib/recentGroups';
import { SplitBetween } from '../components/SplitBetween';
import { SplitPeopleSheet } from '../components/SplitPeopleSheet';
import { useLeaveForm } from '../lib/detailsNav';
import { actorOf } from '../lib/rowActions';
import { fundAvailable, fundPaidCheck, isFundAdmin } from '../lib/fund';
import { EntryTypeSwitch, type EntryType } from '../components/EntryTypeSwitch';
import { IncomeForm } from '../components/IncomeForm';
import { FundPaidPanel } from '../components/FundPaidPanel';
import { SplitModePicker } from '../components/SplitModePicker';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { Avatar } from '../components/Avatar';
import { Pill } from '../components/Pill';
import { InlineError } from '../components/InlineError';
import { Skeleton, SkeletonList } from '../components/Skeleton';
import { Icon } from '../components/icons';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';

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
 * split says what each pays; exact amounts and percentages say what is left (or over), and with blank boxes how many
 * share what is left, naming the person when only one does.
 * `total` is the amount being split (null until it is typed); `assigned` is the sum of the typed values (hundredths of a
 * percent for percentages, dong for exact amounts); `autoCount` and `autoName` describe the blank boxes.
 */
function splitCaption(
  t: T,
  mode: SplitMode,
  people: number,
  result: SplitResult | null,
  total: number | null,
  assigned: number,
  autoCount: number,
  autoName: string,
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
      if (total === null) return t('split.captionExact', { n: people });
      const left = total - assigned;
      if (left < 0) return t('split.captionExactOver', { n: people, amount: formatVnd(-left) });
      if (autoCount === 0) {
        return left === 0 ? t('split.captionExact', { n: people }) : t('split.captionExactLeft', { n: people, amount: formatVnd(left) });
      }
      if (left === 0) {
        return autoCount === 1
          ? t('split.captionExactNothingOne', { n: people, name: autoName })
          : t('split.captionExactNothing', { n: people, k: autoCount });
      }
      return autoCount === 1
        ? t('split.captionExactLeftFor', { n: people, amount: formatVnd(left), name: autoName })
        : t('split.captionExactShare', { n: people, k: autoCount, amount: formatVnd(left) });
    }
    case 'percent': {
      const left = 10000 - assigned;
      const pct = fromEntryValue('percent', Math.abs(left));
      if (left < 0) return t('split.captionPercentOver', { n: people, pct });
      if (autoCount === 0) {
        return left === 0 ? t('split.captionPercent', { n: people }) : t('split.captionPercentLeft', { n: people, pct });
      }
      if (left === 0) {
        return autoCount === 1
          ? t('split.captionPercentNothingOne', { n: people, name: autoName })
          : t('split.captionPercentNothing', { n: people, k: autoCount });
      }
      return autoCount === 1
        ? t('split.captionPercentLeftFor', { n: people, pct, name: autoName })
        : t('split.captionPercentShare', { n: people, k: autoCount, pct });
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

/** The Paid by choice for the group fund. It only lives in the form: a fund-paid expense is sent with its recorder as payer. */
const FUND_PAYER = '__fund__';

interface ExpenseFormContentProps {
  view: TripView;
  tripId: string;
  expenseId?: string;
  expense?: ExpenseView;
  title: string;
  /** The Expense / Fund income switcher, shown first in the form (fund admins on a new entry). */
  switcher?: ReactNode;
  leave: () => void;
}

interface ShuttleRow {
  qty: string;
  unitPrice: string;
}

interface SportGuestState {
  guestFemaleSlots: number;
  guestMaleSlots: number;
  fixedText: string;
}

function ExpenseFormContent({ view, tripId, expenseId, expense, title, switcher, leave }: ExpenseFormContentProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: groupPeople } = useGroupPeople();
  const { href } = useTrip(view.trip.id);

  const isEdit = Boolean(expenseId);
  const me = view.me.participantId;
  const isDirect = view.trip.preset === 'direct';

  // Fund admins may pay from the group fund. A fund-paid expense keeps the choice while it is edited (the route lets
  // only fund admins open it), and may spend its own amount again on top of the balance.
  const editingFundPaid = expense !== undefined && isFundPaid(expense);
  const offerFund = isFundAdmin(view) || editingFundPaid;
  const available = fundAvailable(view, expense);

  // People who left stay only on an expense they are already on; a new expense never offers them.
  const formPeople = useMemo(() => {
    const onExpense = new Set(expense ? [expense.payerId, ...expense.shares.map((s) => s.participantId)] : []);
    return view.people.filter((p) => p.status !== 'left' || onExpense.has(p.id));
  }, [view.people, expense]);

  const splitCandidates = useMemo(() => {
    if (!isDirect || !groupPeople) return [];
    // The server leaves out people already in the ledger by identity; same names stay pickable.
    return groupPeople
      .map((c) => ({
        id: c.participantId,
        name: c.name,
        meta: c.tripName,
      }));
  }, [isDirect, groupPeople]);

  const splitExtra = useMemo(() => {
    if (!isDirect) return undefined;
    return {
      candidates: splitCandidates,
      onPickCandidate: async (id: string) => {
        const { participantId } = await importPerson({ participantId: id });
        await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
        return participantId;
      },
      onAddName: async (name: string) => {
        // The sheet has already shown the similar names above this button: tapping it is the "yes, someone new".
        const { participantId } = await importPerson({ name, confirmNew: true });
        await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
        return participantId;
      },
    };
  }, [isDirect, splitCandidates, queryClient, tripId]);

  // The trip refreshes while the form is open: someone removed or leaving meanwhile drops off the split, and is named.
  const [openedWith] = useState(() => new Map(formPeople.map((p) => [p.id, p.name])));
  const goneNames = [...openedWith].filter(([id]) => !formPeople.some((p) => p.id === id)).map(([, name]) => name);

  // Form field states
  const [description, setDescription] = useState(() => expense?.description ?? '');
  const [amountText, setAmountText] = useState(() =>
    expense ? fromEntryValue('amounts', expense.amount) : '',
  );
  const [spentOn, setSpentOn] = useState(() => expense?.spentOn ?? getTodayLocalDate());
  const [payerId, setPayerId] = useState(() =>
    editingFundPaid ? FUND_PAYER : (expense?.payerId ?? (me ?? formPeople[0]?.id ?? '')),
  );
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
    return [];
  });

  const [showExtra, setShowExtra] = useState<boolean>(() => {
    return Boolean(expense?.meta?.sport?.extra && expense.meta.sport.extra > 0);
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
    return 'equal';
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

  // Gender Quick-Edit State
  const [genderOverrides, setGenderOverrides] = useState<Record<string, 'M' | 'F'>>({});
  const [genderPopoverId, setGenderPopoverId] = useState<string | null>(null);

  const getEffectiveGender = (personId: string, rosterGender?: 'M' | 'F' | null): 'M' | 'F' => {
    return genderOverrides[personId] ?? (rosterGender === 'F' ? 'F' : 'M');
  };

  // Sport Participant Guest / Fixed Slots
  const [sportGuests, setSportGuests] = useState<Record<string, SportGuestState>>(() => {
    const init: Record<string, SportGuestState> = {};
    const metaEntries = expense?.meta?.sport?.entries;
    const metaMap = metaEntries ? new Map(metaEntries.map((e) => [e.participantId, e])) : null;

    for (const person of formPeople) {
      const metaEntry = metaMap?.get(person.id);
      if (metaEntry) {
        const baseFemale = person.gender === 'F' ? 1 : 0;
        const baseMale = person.gender === 'F' ? 0 : 1;
        init[person.id] = {
          guestFemaleSlots: Math.max(0, metaEntry.femaleSlots - baseFemale),
          guestMaleSlots: Math.max(0, metaEntry.maleSlots - baseMale),
          fixedText:
            metaEntry.fixedAmount !== undefined && metaEntry.fixedAmount !== null
              ? fromEntryValue('amounts', metaEntry.fixedAmount)
              : '',
        };
      } else {
        init[person.id] = {
          guestFemaleSlots: 0,
          guestMaleSlots: 0,
          fixedText: '',
        };
      }
    }
    return init;
  });

  const [openDrawerId, setOpenDrawerId] = useState<string | null>(null);

  // Split states
  const [included, setIncluded] = useState<Set<string>>(() => {
    // A fund-paid expense has no shares: choosing a person on it starts from everyone, as a new expense does.
    if (expense && !editingFundPaid) {
      return new Set(expense.shares.map((s) => s.participantId));
    }
    if (isDirect) {
      return new Set(me ? [me] : []);
    }
    return new Set(formPeople.map((p) => p.id));
  });
  const [peopleSheetOpen, setPeopleSheetOpen] = useState(false);

  const [amountsInputs, setAmountsInputs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of formPeople) init[p.id] = '';
    if (expense && expense.mode === 'amounts') {
      for (const s of expense.shares) {
        init[s.participantId] = fromEntryValue('amounts', s.inputValue);
      }
    }
    return init;
  });

  const [percentInputs, setPercentInputs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of formPeople) init[p.id] = '';
    if (expense && expense.mode === 'percent') {
      for (const s of expense.shares) {
        init[s.participantId] = fromEntryValue('percent', s.inputValue);
      }
    }
    return init;
  });

  const [sharesInputs, setSharesInputs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of formPeople) init[p.id] = '';
    if (expense && expense.mode === 'shares') {
      for (const s of expense.shares) {
        init[s.participantId] = fromEntryValue('shares', s.inputValue);
      }
    }
    return init;
  });

  const [adjustInputs, setAdjustInputs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of formPeople) init[p.id] = '';
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

  // Who is in comes from the Split between sheet: one entry each, in group order. A blank exact-amount or percent box
  // is automatic (null), and core gives it an equal part of what the typed boxes leave.
  const { entries, hasInvalidInput, inputErrors } = useMemo(() => {
    const inputsByMode: Record<SplitMode, Record<string, string> | null> = {
      equal: null,
      amounts: amountsInputs,
      percent: percentInputs,
      shares: sharesInputs,
      adjust: adjustInputs,
    };
    const inputs = inputsByMode[mode];
    const errors: Record<string, boolean> = {};
    const resultEntries: SplitEntry[] = [];
    for (const person of formPeople) {
      if (!included.has(person.id)) continue;
      const read = readSplitInput(mode, inputs?.[person.id] ?? '');
      if (read.ok) resultEntries.push({ participantId: person.id, value: read.value });
      else errors[person.id] = true;
    }
    return { entries: resultEntries, hasInvalidInput: Object.keys(errors).length > 0, inputErrors: errors };
  }, [mode, included, adjustInputs, amountsInputs, percentInputs, sharesInputs, formPeople]);

  const parsedCourt = useMemo(() => parseVnd(courtText) || 0, [courtText]);
  const parsedExtra = useMemo(() => (showExtra ? parseVnd(extraText) || 0 : 0), [showExtra, extraText]);

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

    for (const person of formPeople) {
      if (!included.has(person.id)) continue;
      const effectiveGender = getEffectiveGender(person.id, person.gender);
      const baseFemale = effectiveGender === 'F' ? 1 : 0;
      const baseMale = effectiveGender === 'F' ? 0 : 1;
      const guest = sportGuests[person.id] ?? {
        guestFemaleSlots: 0,
        guestMaleSlots: 0,
        fixedText: '',
      };
      const fSlots = baseFemale + guest.guestFemaleSlots;
      const mSlots = baseMale + guest.guestMaleSlots;
      const fixed = guest.fixedText.trim() !== '' ? parseVnd(guest.fixedText) : null;

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
  }, [formPeople, included, sportGuests, genderOverrides]);

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

  const autoEntries = entries.filter((e) => e.value === null);
  const autoCount = autoEntries.length;
  const autoName = autoCount === 1 ? (formPeople.find((p) => p.id === autoEntries[0]!.participantId)?.name ?? '') : '';
  const assigned = entries.reduce((sum, e) => sum + (e.value ?? 0), 0);
  const caption = splitCaption(t, mode, entries.length, splitResult, parsedAmount, assigned, autoCount, autoName);
  const recent = useMemo(
    () => recentGroups(view.expenses, formPeople, included, expenseId),
    [view.expenses, formPeople, included, expenseId],
  );

  // The grey hint in an empty box: what that person gets. An exact amount shows their share once the split works out;
  // a percentage is what is left of 100% over the blank boxes; a blank share is one share and a blank adjustment none.
  function placeholderFor(personId: string): string {
    switch (mode) {
      case 'amounts': {
        const share = splitResult?.ok ? splitResult.shares.find((s) => s.participantId === personId)?.amount : undefined;
        return share === undefined ? '0' : fromEntryValue('amounts', share);
      }
      case 'percent':
        return autoCount > 0 && assigned < 10000 ? fromEntryValue('percent', Math.round((10000 - assigned) / autoCount)) : '0';
      case 'shares':
        return '1';
      default:
        return '0';
    }
  }

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
      for (const e of entries) if (e.value !== null) map.set(e.participantId, e.value);
    } else if (mode === 'percent' && parsedAmount !== null) {
      for (const e of entries) {
        if (e.value === null) continue;
        const share = Math.round((parsedAmount * e.value) / 10000);
        if (Number.isSafeInteger(share)) map.set(e.participantId, share);
      }
    }
    return map;
  }, [sportSelected, sportResult, splitResult, mode, entries, parsedAmount]);

  const isDescriptionValid = description.trim().length > 0;
  // A payer who left while the form was open is not offered any more, nor the fund to someone who stopped being an
  // admin: the form asks who paid instead.
  const payer =
    payerId === FUND_PAYER
      ? (offerFund ? FUND_PAYER : '')
      : formPeople.some((p) => p.id === payerId) ? payerId : '';
  const fromFund = payer === FUND_PAYER;
  // Paid from the fund there is nothing to split: the sport cost card gives way to the plain Amount field.
  const sportShown = sportSelected && !fromFund;
  const isPayerValid = payer !== '';
  const isAmountValid = parsedAmount !== null;
  const isSplitValid = Boolean(splitResult?.ok && !hasInvalidInput);
  // Checked as the API checks it. With no amount yet 1₫ stands in, so a fund with nothing to spend says so as soon as
  // it is chosen (spec §9.1).
  const fundCheck = fundPaidCheck(view, expense, parsedAmount ?? 1);
  const isFundAmountValid = parsedAmount !== null && !fundCheck.over;

  const isSportAmountValid = sportTotal > 0;
  const isSportSplitValid = Boolean(sportResult?.ok);

  const canSubmit =
    isDescriptionValid &&
    isPayerValid &&
    (fromFund
      ? isFundAmountValid
      : sportSelected
        ? isSportAmountValid && isSportSplitValid
        : isAmountValid && isSplitValid);

  async function handleUpdateGender(personId: string, gender: 'M' | 'F') {
    setGenderOverrides((prev) => ({ ...prev, [personId]: gender }));
    setGenderPopoverId(null);
    try {
      await apiSend(`/api/trips/${tripId}/people/${personId}`, 'PATCH', { gender }, tripId);
      await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    } catch (err) {
      console.error('Failed to update gender', err);
    }
  }

  function formatSubmitError(err: unknown) {
    if (!err) return null;
    if (typeof err === 'object' && err !== null && 'code' in err) {
      const apiErr = err as { code: string; message?: string };
      if (apiErr.code === 'PERSON_LEFT') {
        // InlineError shows a form's own message for a validation error.
        return { code: 'VALIDATION', message: t('expenseForm.personLeft') };
      }
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
      if (fromFund) {
        if (parsedAmount === null || me === null) return;
        // Nobody owes a share: no entries, and whoever records it is the payer (the API sets that too).
        const body: ExpenseInput = {
          description: description.trim(),
          amount: parsedAmount,
          spentOn,
          payerId: me,
          mode: 'equal',
          entries: [],
          meta: { paidFromFund: true },
        };

        if (isEdit && expenseId) {
          await apiSend(`/api/trips/${tripId}/expenses/${expenseId}`, 'PATCH', body, tripId);
        } else {
          await apiSend(`/api/trips/${tripId}/expenses`, 'POST', body, tripId);
        }
        await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
        leave();
      } else if (sportSelected) {
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
          navigate(href(`/expenses/${res.expenseId}`), { replace: true });
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
      // The trip changed under the form: fetch it again so whoever left drops off the split.
      if (err instanceof ApiClientError && err.code === 'PERSON_LEFT') {
        void queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
      }
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
      title={isDirect && !isEdit ? t('home.newExpense') : title}
      onBack={leave}
      bottomBar={
        <>
          {submitError ? <InlineError error={formatSubmitError(submitError)} /> : null}
          {goneNames.length > 0 && (
            <p className={cn('fsl-expense-form__gone m-0 mb-2 text-center text-sm leading-snug text-muted-foreground')} role="status">
              {t('expenseForm.peopleLeft', { names: goneNames.join(', ') })}
            </p>
          )}
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
        className={cn(
          'fsl-expense-form flex flex-col gap-4 w-full',
          Boolean(submitError || goneNames.length > 0) && 'fsl-expense-form--bar-error max-lg:pb-24',
        )}
      >
        {!isDirect && switcher}

        <div className={cn('fsl-field flex flex-col gap-1.5')}>
          <Label htmlFor="expense-what-for" className={cn('fsl-field-label text-foreground')}>
            {t('expenseForm.whatFor')}
          </Label>
          <Input
            id="expense-what-for"
            type="text"
            className="fsl-input"
            placeholder={sportShown ? t('sport.whatForPlaceholder') : t('expenseForm.whatForPlaceholder')}
            maxLength={80}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {sportShown ? (
          <div className={cn('fsl-sport-costs-card rounded-xl border border-border bg-card p-3 flex flex-col gap-3')}>
            <h3 className={cn('fsl-sport-costs-title m-0 text-base font-semibold text-foreground')}>{t('sport.costsTitle')}</h3>

            <div className={cn('fsl-field flex flex-col gap-1.5')}>
              <Label htmlFor="sport-court" className={cn('fsl-field-label text-foreground')}>
                {t('sport.court')}
              </Label>
              <Input
                id="sport-court"
                type="text"
                inputMode="decimal"
                className="fsl-input fsl-input--amount font-semibold tabular-nums"
                placeholder="0"
                value={courtText}
                onChange={(e) => setCourtText(e.target.value)}
              />
              {parsedCourt > 0 && (
                <div className={cn('fsl-amount-preview text-sm font-semibold tabular-nums text-muted-foreground')}>
                  {formatVnd(parsedCourt)}
                </div>
              )}
            </div>

            {shuttleRows.length > 0 && (
              <div className={cn('fsl-sport-shuttle-section flex flex-col gap-2')}>
                <span className={cn('fsl-field-label text-sm font-medium text-foreground')}>{t('sport.shuttlecocks')}</span>
                {shuttleRows.map((row, idx) => {
                  const qty = parseInt(row.qty, 10) || 0;
                  const unitPrice = parseVnd(row.unitPrice) || 0;
                  const subtotal = qty * unitPrice;

                  return (
                    <div key={idx} className={cn('fsl-shuttle-row flex items-center gap-2')}>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        className="fsl-input fsl-input--qty w-16 px-2 text-center"
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
                      <span className={cn('fsl-shuttle-times text-base text-muted-foreground select-none')} aria-hidden="true">×</span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        className="fsl-input fsl-input--unit-price flex-1 tabular-nums"
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
                      <span className={cn('fsl-shuttle-subtotal text-sm font-semibold tabular-nums text-foreground min-w-[70px] text-right whitespace-nowrap')}>
                        {formatVnd(subtotal)}
                      </span>
                      <button
                        type="button"
                        className={cn(
                          'fsl-shuttle-remove inline-flex items-center justify-center size-11 shrink-0 rounded-lg bg-transparent p-0 text-muted-foreground hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
                        )}
                        aria-label={t('sport.removeShuttleRow', { n: idx + 1 })}
                        onClick={() => {
                          setShuttleRows((rows) => rows.filter((_, i) => i !== idx));
                        }}
                      >
                        <Icon name="x" size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {showExtra && (
              <div className={cn('fsl-field flex flex-col gap-1.5')}>
                <Label htmlFor="sport-extra" className={cn('fsl-field-label text-foreground')}>
                  {t('sport.extra')}
                </Label>
                <div className={cn('fsl-extra-row flex items-center gap-2')}>
                  <Input
                    id="sport-extra"
                    type="text"
                    inputMode="decimal"
                    className="fsl-input flex-1 tabular-nums"
                    aria-label={t('sport.extra')}
                    placeholder="0"
                    value={extraText}
                    onChange={(e) => setExtraText(e.target.value)}
                  />
                  <button
                    type="button"
                    className={cn(
                      'fsl-extra-remove inline-flex items-center justify-center size-11 shrink-0 rounded-lg bg-transparent p-0 text-muted-foreground hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
                    )}
                    aria-label={t('sport.removeExtraFee')}
                    onClick={() => {
                      setShowExtra(false);
                      setExtraText('');
                    }}
                  >
                    <Icon name="x" size={16} />
                  </button>
                </div>
                {parsedExtra > 0 && (
                  <div className={cn('fsl-amount-preview text-sm font-semibold tabular-nums text-muted-foreground')}>
                    {formatVnd(parsedExtra)}
                  </div>
                )}
              </div>
            )}

            <div className={cn('fsl-sport-actions-row flex items-center gap-2 flex-wrap')}>
              {shuttleRows.length < 3 && (
                <button
                  type="button"
                  className={cn(
                    'fsl-sport-add-btn self-start inline-flex items-center justify-center min-h-11 px-3 py-2 rounded-xl border border-dashed border-border bg-transparent text-sm font-semibold text-primary hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
                  )}
                  onClick={() => {
                    setShuttleRows((rows) => [...rows, { qty: '1', unitPrice: '' }]);
                  }}
                >
                  + {t('sport.addShuttlecock')}
                </button>
              )}
              {!showExtra && (
                <button
                  type="button"
                  className={cn(
                    'fsl-sport-add-btn self-start inline-flex items-center justify-center min-h-11 px-3 py-2 rounded-xl border border-dashed border-border bg-transparent text-sm font-semibold text-primary hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
                  )}
                  onClick={() => setShowExtra(true)}
                >
                  + {t('sport.addExtraFee')}
                </button>
              )}
            </div>

            <div className={cn('fsl-sport-total-bar flex items-center justify-between px-3 py-2 bg-muted rounded-xl mt-1 text-sm text-foreground')}>
              <span className={cn('fsl-sport-total-bar__slots text-muted-foreground')}>
                {t('sport.totalBar', {
                  slots: totalMaleSlots + totalFemaleSlots,
                  f: totalFemaleSlots,
                  m: totalMaleSlots,
                })}
              </span>
              <span className={cn('fsl-sport-total-bar__total tabular-nums text-foreground font-semibold whitespace-nowrap')}>
                <span className={cn('fsl-sport-total-bar__label font-normal text-muted-foreground')}>{t('sport.totalLabel')}:</span>{' '}
                <strong>{formatVnd(sportTotal)}</strong>
              </span>
            </div>
          </div>
        ) : (
          <div className={cn('fsl-field flex flex-col gap-1.5')}>
            <Label htmlFor="expense-amount" className={cn('fsl-field-label text-foreground')}>
              {t('expenseForm.amount')}
            </Label>
            <Input
              id="expense-amount"
              type="text"
              inputMode="decimal"
              className="fsl-input fsl-input--amount font-semibold tabular-nums"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              aria-describedby={isAmountInvalid ? 'expense-amount-error' : 'expense-amount-hint'}
            />
            {parsedAmount !== null && (
              <div className={cn('fsl-amount-preview text-sm font-semibold tabular-nums text-muted-foreground')}>
                {formatVnd(parsedAmount)}
              </div>
            )}
            {isAmountInvalid ? (
              <div id="expense-amount-error" role="alert" className={cn('fsl-field-error text-sm text-danger')}>
                {t('expenseForm.amountInvalid')}
              </div>
            ) : (
              <div id="expense-amount-hint" className={cn('fsl-field-hint text-sm text-muted-foreground')}>
                {t('expenseForm.amountHint')}
              </div>
            )}
          </div>
        )}

        {/* "Group fund · 500.000₫" is too long for half the row on a phone: paid from the fund, Paid by gets the full width. */}
        <div className={cn('fsl-expense-form__row grid gap-3', fromFund ? 'fsl-expense-form__row--stack grid-cols-1' : 'grid-cols-2')}>
          <div className={cn('fsl-field min-w-0 flex flex-col gap-1.5')}>
            <Label htmlFor="expense-date" className={cn('fsl-field-label text-foreground')}>
              {t('expenseForm.date')}
            </Label>
            <Input
              id="expense-date"
              type="date"
              className="fsl-input"
              value={spentOn}
              onChange={(e) => setSpentOn(e.target.value)}
            />
          </div>

          <div className={cn('fsl-field min-w-0 flex flex-col gap-1.5')}>
            <Label htmlFor="expense-paid-by" className={cn('fsl-field-label text-foreground')}>
              {t('expenseForm.paidBy')}
            </Label>
            <NativeSelect
              id="expense-paid-by"
              className="fsl-select"
              value={payer}
              onChange={(e) => {
                const next = e.target.value;
                // The sport cost card turns into the plain Amount field: a total typed there carries over.
                if (next === FUND_PAYER && sportSelected && sportTotal > 0) {
                  setAmountText(fromEntryValue('amounts', sportTotal));
                }
                setPayerId(next);
              }}
            >
              {payer === '' && (
                <NativeSelectOption value="" disabled>
                  {t('expenseForm.choosePayer')}
                </NativeSelectOption>
              )}
              {offerFund && (
                <NativeSelectOption value={FUND_PAYER}>{t('fund.payerOption', { amount: formatVnd(available) })}</NativeSelectOption>
              )}
              {formPeople.map((person) => (
                <NativeSelectOption key={person.id} value={person.id}>
                  {person.id === me
                    ? t('expenseForm.me', { name: person.name })
                    : person.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>

        <div className={cn('fsl-expense-form__split-section flex flex-col gap-2')}>
          <h2 className={cn('fsl-section-heading text-sm font-semibold text-muted-foreground m-0')}>{t('expenseForm.split')}</h2>
          {fromFund ? (
            <FundPaidPanel available={available} after={parsedAmount === null ? null : fundCheck.after} over={fundCheck.over} />
          ) : (
            <>
              <SplitBetween people={formPeople} chosen={included} me={me} onOpen={() => setPeopleSheetOpen(true)} />

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
                <div className={cn('fsl-sport-rule-section flex flex-col gap-2 mt-2')}>
                  <div
                    role="radiogroup"
                    aria-label={t('sport.ruleTitle')}
                    className={cn('fsl-sport-rule-picker flex bg-muted rounded-xl p-1 gap-1')}
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={ruleKind === 'equal'}
                      className={cn(
                        'fsl-sport-rule-btn flex-1 min-w-0 min-h-11 inline-flex items-center justify-center gap-1.5 rounded-lg text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
                        ruleKind === 'equal'
                          ? 'fsl-sport-rule-btn--active bg-card text-foreground font-semibold shadow-xs'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                      onClick={() => setRuleKind('equal')}
                    >
                      <span aria-hidden="true">=</span>
                      <span>{t('sport.ruleEqual')}</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={ruleKind === 'discount'}
                      className={cn(
                        'fsl-sport-rule-btn flex-1 min-w-0 min-h-11 inline-flex items-center justify-center gap-1.5 rounded-lg text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
                        ruleKind === 'discount'
                          ? 'fsl-sport-rule-btn--active bg-card text-foreground font-semibold shadow-xs'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                      onClick={() => setRuleKind('discount')}
                    >
                      <span aria-hidden="true">+/−</span>
                      <span>{t('sport.ruleDiscount')}</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={ruleKind === 'ratio'}
                      className={cn(
                        'fsl-sport-rule-btn flex-1 min-w-0 min-h-11 inline-flex items-center justify-center gap-1.5 rounded-lg text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
                        ruleKind === 'ratio'
                          ? 'fsl-sport-rule-btn--active bg-card text-foreground font-semibold shadow-xs'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                      onClick={() => setRuleKind('ratio')}
                    >
                      <Icon name="pie" size={16} />
                      <span>{t('sport.ruleRatio')}</span>
                    </button>
                  </div>

                  {ruleKind === 'discount' && (
                    <div className={cn('fsl-sport-rule-input-row flex items-center gap-2 mt-1')}>
                      <Icon name="venus" size={16} className={cn('fsl-sport-rule-icon--female text-warning-foreground shrink-0')} />
                      <Label htmlFor="sport-female-discount" className={cn('fsl-sport-rule-label text-foreground')}>
                        {t('sport.femaleDiscountLabel')}
                      </Label>
                      <Input
                        id="sport-female-discount"
                        type="text"
                        inputMode="decimal"
                        placeholder="15k"
                        className="fsl-input fsl-input--discount w-[120px] tabular-nums"
                        value={discountText}
                        onChange={(e) => setDiscountText(e.target.value)}
                      />
                    </div>
                  )}

                  {ruleKind === 'ratio' && (
                    <div className={cn('fsl-sport-rule-input-row flex items-center gap-2 mt-1')}>
                      <Icon name="mars" size={16} className={cn('fsl-sport-rule-icon--male text-primary shrink-0')} />
                      <Input
                        type="text"
                        inputMode="decimal"
                        aria-label={t('sport.maleWeightLabel')}
                        className="fsl-input fsl-input--ratio w-20 px-2 text-center tabular-nums"
                        value={maleWeightText}
                        onChange={(e) => setMaleWeightText(e.target.value)}
                      />
                      <span aria-hidden="true">:</span>
                      <Icon name="venus" size={16} className={cn('fsl-sport-rule-icon--female text-warning-foreground shrink-0')} />
                      <Input
                        type="text"
                        inputMode="decimal"
                        aria-label={t('sport.femaleWeightLabel')}
                        className="fsl-input fsl-input--ratio w-20 px-2 text-center tabular-nums"
                        value={femaleWeightText}
                        onChange={(e) => setFemaleWeightText(e.target.value)}
                      />
                    </div>
                  )}

                  <div className={cn('fsl-sport-slot-summary text-sm text-muted-foreground tabular-nums mt-1')}>
                    {t('sport.slotSummary', {
                      m: formatVnd(sportResult?.ok ? sportResult.maleSlotRate : 0),
                      f: formatVnd(sportResult?.ok ? sportResult.femaleSlotRate : 0),
                    })}
                  </div>
                </div>
              ) : (
                <p className={cn('fsl-split-caption m-0 text-sm leading-snug text-muted-foreground tabular-nums')}>{caption}</p>
              )}

              {sportSelected && sportResult && !sportResult.ok && (
                <div role="alert" className={cn('fsl-split-error mt-1 text-sm font-medium leading-snug text-danger')}>
                  {t(`splitError.${sportResult.error}` as MessageKey)}
                </div>
              )}

              <div className={cn('fsl-card rounded-xl bg-card border border-border overflow-hidden')}>
                {formPeople.filter((person) => included.has(person.id)).map((person) => {
                  const shareAmount = liveShares.get(person.id);
                  const isInputInvalid = Boolean(inputErrors[person.id]);

                  if (sportSelected) {
                    const effectiveGender = getEffectiveGender(person.id, person.gender);
                    const baseFemale = effectiveGender === 'F' ? 1 : 0;
                    const baseMale = effectiveGender === 'F' ? 0 : 1;
                    const guest = sportGuests[person.id] ?? {
                      guestFemaleSlots: 0,
                      guestMaleSlots: 0,
                      fixedText: '',
                    };
                    const fSlots = baseFemale + guest.guestFemaleSlots;
                    const mSlots = baseMale + guest.guestMaleSlots;
                    const isFixed = guest.fixedText.trim() !== '' && parseVnd(guest.fixedText) !== null;
                    const isAdminOrOrganiser = Boolean(view.me.isAdmin || view.me.isOrganiser);

                    let badgeText = '';
                    if (isFixed) {
                      badgeText = t('sport.fixedBadge');
                    } else if (mSlots === 1 && fSlots === 0) {
                      badgeText = t('sport.oneMale');
                    } else if (fSlots === 1 && mSlots === 0) {
                      badgeText = t('sport.oneFemale');
                    } else {
                      badgeText = t('sport.slotsBadge', { f: fSlots, m: mSlots });
                    }

                    return (
                      <div
                        key={person.id}
                        className={cn(
                          'fsl-split-row fsl-split-row--sport flex flex-col items-stretch gap-3 px-4 py-2 border-b border-border last:border-b-0 min-h-[52px]',
                        )}
                        data-testid={`split-row-${person.name}`}
                      >
                        <div className={cn('fsl-split-row__main flex items-center gap-3 min-h-[52px] w-full')}>
                          <Avatar name={person.name} avatarUrl={person.avatarUrl} size="sm" />
                          <span className={cn('fsl-split-row__name flex-1 min-w-0 font-semibold text-base text-foreground truncate')}>
                            {person.id === me
                              ? t('expenseForm.me', { name: person.name })
                              : person.name}
                          </span>
                          {person.status === 'left' && <Pill tone="neutral">{t('people.leftBadge')}</Pill>}

                          {isAdminOrOrganiser ? (
                            <div className={cn('fsl-gender-popover-anchor relative inline-flex')}>
                              <button
                                type="button"
                                className={cn(
                                  'fsl-sport-badge fsl-sport-badge--interactive inline-flex items-center min-h-8 px-2.5 py-1 rounded-full border border-border bg-card text-foreground text-xs font-medium tabular-nums shrink-0 cursor-pointer hover:border-primary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                )}
                                data-testid={`gender-badge-${person.id}`}
                                aria-label={t('sport.editGender')}
                                onClick={() =>
                                  setGenderPopoverId(genderPopoverId === person.id ? null : person.id)
                                }
                              >
                                {badgeText}
                              </button>
                              {genderPopoverId === person.id && (
                                <div className={cn('fsl-gender-popover absolute top-full left-0 mt-1 z-10 inline-flex gap-1 p-1 bg-card border border-border rounded-xl shadow-md')} role="dialog" aria-label={t('sport.editGender')}>
                                  <button
                                    type="button"
                                    className={cn(
                                      'fsl-gender-popover__btn inline-flex items-center gap-1.5 px-3 py-1 min-h-11 bg-transparent border border-border rounded-lg text-sm font-medium text-foreground cursor-pointer hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                    )}
                                    onClick={() => handleUpdateGender(person.id, 'M')}
                                  >
                                    <Icon name="mars" size={14} />
                                    <span>{t('people.genderMale')}</span>
                                  </button>
                                  <button
                                    type="button"
                                    className={cn(
                                      'fsl-gender-popover__btn inline-flex items-center gap-1.5 px-3 py-1 min-h-11 bg-transparent border border-border rounded-lg text-sm font-medium text-foreground cursor-pointer hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                    )}
                                    onClick={() => handleUpdateGender(person.id, 'F')}
                                  >
                                    <Icon name="venus" size={14} />
                                    <span>{t('people.genderFemale')}</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className={cn('fsl-sport-badge inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium tabular-nums shrink-0')}>{badgeText}</span>
                          )}

                          <button
                            type="button"
                            className={cn(
                              'fsl-sport-share-btn inline-flex items-center gap-1.5 min-h-11 px-3 py-1 bg-transparent border border-border rounded-xl text-base font-semibold tabular-nums text-foreground cursor-pointer shrink-0 hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            )}
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

                        {openDrawerId === person.id && (
                          <div className={cn('fsl-sport-drawer flex flex-col gap-3 p-3 bg-muted rounded-xl mt-2 w-full')}>
                            <div className={cn('fsl-sport-drawer__guest-section flex flex-col gap-2 pb-2 border-b border-border')}>
                              <div className={cn('fsl-sport-drawer__title text-sm font-semibold text-foreground mb-1')}>{t('sport.bringsGuest')}</div>
                              <div className={cn('fsl-sport-drawer__stepper-row flex items-center justify-between gap-2')}>
                                <div className={cn('fsl-sport-drawer__stepper-label flex items-center gap-2 text-sm text-foreground')}>
                                  <Icon name="venus" size={16} className={cn('fsl-sport-rule-icon--female text-warning-foreground shrink-0')} />
                                  <span>{t('sport.femaleGuest')}</span>
                                </div>
                                <div className={cn('fsl-sport-drawer__stepper inline-flex items-center gap-2')}>
                                  <button
                                    type="button"
                                    className={cn(
                                      'fsl-stepper-btn flex items-center justify-center size-11 border border-border bg-card rounded-xl text-base font-semibold text-foreground cursor-pointer p-0 disabled:opacity-40 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-ring hover:not-disabled:bg-accent transition-colors',
                                    )}
                                    aria-label={`Decrease female guest for ${person.name}`}
                                    disabled={guest.guestFemaleSlots <= 0}
                                    onClick={() => {
                                      setSportGuests((prev) => ({
                                        ...prev,
                                        [person.id]: {
                                          ...prev[person.id]!,
                                          guestFemaleSlots: Math.max(0, prev[person.id]!.guestFemaleSlots - 1),
                                        },
                                      }));
                                    }}
                                  >
                                    −
                                  </button>
                                  <span className={cn('fsl-stepper-count text-base font-semibold tabular-nums min-w-6 text-center text-foreground')} data-testid={`guest-f-${person.id}`}>
                                    {guest.guestFemaleSlots}
                                  </span>
                                  <button
                                    type="button"
                                    className={cn(
                                      'fsl-stepper-btn flex items-center justify-center size-11 border border-border bg-card rounded-xl text-base font-semibold text-foreground cursor-pointer p-0 disabled:opacity-40 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-ring hover:not-disabled:bg-accent transition-colors',
                                    )}
                                    aria-label={`Increase female guest for ${person.name}`}
                                    disabled={guest.guestFemaleSlots >= 20}
                                    onClick={() => {
                                      setSportGuests((prev) => ({
                                        ...prev,
                                        [person.id]: {
                                          ...prev[person.id]!,
                                          guestFemaleSlots: Math.min(20, prev[person.id]!.guestFemaleSlots + 1),
                                        },
                                      }));
                                    }}
                                  >
                                    +
                                  </button>
                                </div>
                              </div>

                              <div className={cn('fsl-sport-drawer__stepper-row flex items-center justify-between gap-2')}>
                                <div className={cn('fsl-sport-drawer__stepper-label flex items-center gap-2 text-sm text-foreground')}>
                                  <Icon name="mars" size={16} className={cn('fsl-sport-rule-icon--male text-primary shrink-0')} />
                                  <span>{t('sport.maleGuest')}</span>
                                </div>
                                <div className={cn('fsl-sport-drawer__stepper inline-flex items-center gap-2')}>
                                  <button
                                    type="button"
                                    className={cn(
                                      'fsl-stepper-btn flex items-center justify-center size-11 border border-border bg-card rounded-xl text-base font-semibold text-foreground cursor-pointer p-0 disabled:opacity-40 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-ring hover:not-disabled:bg-accent transition-colors',
                                    )}
                                    aria-label={`Decrease male guest for ${person.name}`}
                                    disabled={guest.guestMaleSlots <= 0}
                                    onClick={() => {
                                      setSportGuests((prev) => ({
                                        ...prev,
                                        [person.id]: {
                                          ...prev[person.id]!,
                                          guestMaleSlots: Math.max(0, prev[person.id]!.guestMaleSlots - 1),
                                        },
                                      }));
                                    }}
                                  >
                                    −
                                  </button>
                                  <span className={cn('fsl-stepper-count text-base font-semibold tabular-nums min-w-6 text-center text-foreground')} data-testid={`guest-m-${person.id}`}>
                                    {guest.guestMaleSlots}
                                  </span>
                                  <button
                                    type="button"
                                    className={cn(
                                      'fsl-stepper-btn flex items-center justify-center size-11 border border-border bg-card rounded-xl text-base font-semibold text-foreground cursor-pointer p-0 disabled:opacity-40 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-ring hover:not-disabled:bg-accent transition-colors',
                                    )}
                                    aria-label={`Increase male guest for ${person.name}`}
                                    disabled={guest.guestMaleSlots >= 20}
                                    onClick={() => {
                                      setSportGuests((prev) => ({
                                        ...prev,
                                        [person.id]: {
                                          ...prev[person.id]!,
                                          guestMaleSlots: Math.min(20, prev[person.id]!.guestMaleSlots + 1),
                                        },
                                      }));
                                    }}
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            </div>

                            <div className={cn('fsl-sport-drawer__fixed-section flex flex-col gap-1')}>
                              <Label htmlFor={`sport-fixed-${person.id}`} className={cn('fsl-sport-drawer__subtitle block text-xs font-semibold text-muted-foreground mb-1')}>
                                {t('sport.orFixedAmount', { name: person.name })}
                              </Label>
                              <div className={cn('fsl-sport-drawer__fixed-row flex items-center gap-2')}>
                                <Input
                                  id={`sport-fixed-${person.id}`}
                                  type="text"
                                  inputMode="decimal"
                                  aria-label={t('sport.orFixedAmount', { name: person.name })}
                                  placeholder={t('sport.fixedFor', { name: person.name })}
                                  className="fsl-input fsl-input--fixed flex-1 tabular-nums"
                                  value={guest.fixedText}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setSportGuests((prev) => ({
                                      ...prev,
                                      [person.id]: { ...prev[person.id]!, fixedText: val },
                                    }));
                                  }}
                                />
                                {guest.fixedText !== '' && (
                                  <button
                                    type="button"
                                    className={cn(
                                      'fsl-sport-drawer__clear-btn flex items-center justify-center size-11 bg-transparent border-0 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer p-0 outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors',
                                    )}
                                    aria-label={t('sport.clearFixed', { name: person.name })}
                                    onClick={() => {
                                      setSportGuests((prev) => ({
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
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={person.id}
                      className={cn('fsl-split-row flex items-center gap-3 px-4 py-2 border-b border-border last:border-b-0 min-h-[52px]')}
                      data-testid={`split-row-${person.name}`}
                    >
                      <Avatar name={person.name} avatarUrl={person.avatarUrl} size="sm" />

                      <span className={cn('fsl-split-row__name flex-1 min-w-0 font-semibold text-base text-foreground truncate')}>
                        {person.id === me
                          ? t('expenseForm.me', { name: person.name })
                          : person.name}
                      </span>
                      {person.status === 'left' && <Pill tone="neutral">{t('people.leftBadge')}</Pill>}

                      {mode === 'adjust' && (
                        <div className={cn('fsl-split-row__control flex flex-col items-end gap-1')}>
                          <Input
                            type="text"
                            inputMode="decimal"
                            className="fsl-input fsl-split-row__input w-24 px-2 text-right tabular-nums"
                            aria-label={t('expenseForm.adjustFor', { name: person.name })}
                            value={adjustInputs[person.id] ?? ''}
                            placeholder={placeholderFor(person.id)}
                            onChange={(e) =>
                              setAdjustInputs((prev) => ({
                                ...prev,
                                [person.id]: e.target.value,
                              }))
                            }
                          />
                          {isInputInvalid && (
                            <span role="alert" className={cn('fsl-field-error text-xs text-danger')}>
                              {t('expenseForm.amountInvalid')}
                            </span>
                          )}
                        </div>
                      )}

                      {mode === 'amounts' && (
                        <div className={cn('fsl-split-row__control flex flex-col items-end gap-1')}>
                          <Input
                            type="text"
                            inputMode="decimal"
                            className="fsl-input fsl-split-row__input w-24 px-2 text-right tabular-nums"
                            aria-label={t('expenseForm.amountFor', { name: person.name })}
                            value={amountsInputs[person.id] ?? ''}
                            placeholder={placeholderFor(person.id)}
                            onChange={(e) =>
                              setAmountsInputs((prev) => ({
                                ...prev,
                                [person.id]: e.target.value,
                              }))
                            }
                          />
                          {isInputInvalid && (
                            <span role="alert" className={cn('fsl-field-error text-xs text-danger')}>
                              {t('expenseForm.amountInvalid')}
                            </span>
                          )}
                        </div>
                      )}

                      {mode === 'percent' && (
                        <div className={cn('fsl-split-row__control flex flex-col items-end gap-1')}>
                          <Input
                            type="text"
                            inputMode="decimal"
                            className="fsl-input fsl-split-row__input w-24 px-2 text-right tabular-nums"
                            aria-label={t('expenseForm.percentFor', { name: person.name })}
                            value={percentInputs[person.id] ?? ''}
                            placeholder={placeholderFor(person.id)}
                            onChange={(e) =>
                              setPercentInputs((prev) => ({
                                ...prev,
                                [person.id]: e.target.value,
                              }))
                            }
                          />
                          {isInputInvalid && (
                            <span role="alert" className={cn('fsl-field-error text-xs text-danger')}>
                              {t('expenseForm.amountInvalid')}
                            </span>
                          )}
                        </div>
                      )}

                      {mode === 'shares' && (
                        <div className={cn('fsl-split-row__control flex flex-col items-end gap-1')}>
                          <Input
                            type="text"
                            inputMode="decimal"
                            className="fsl-input fsl-split-row__input w-24 px-2 text-right tabular-nums"
                            aria-label={t('expenseForm.sharesFor', { name: person.name })}
                            value={sharesInputs[person.id] ?? ''}
                            placeholder={placeholderFor(person.id)}
                            onChange={(e) =>
                              setSharesInputs((prev) => ({
                                ...prev,
                                [person.id]: e.target.value,
                              }))
                            }
                          />
                          {isInputInvalid && (
                            <span role="alert" className={cn('fsl-field-error text-xs text-danger')}>
                              {t('expenseForm.amountInvalid')}
                            </span>
                          )}
                        </div>
                      )}

                      {shareAmount !== undefined && (
                        <span className={cn('fsl-split-row__share font-semibold tabular-nums text-right whitespace-nowrap text-base text-foreground min-w-16')}>
                          {formatVnd(shareAmount)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {!sportSelected && parsedAmount !== null && splitResult && !splitResult.ok && (
                <div role="alert" className={cn('fsl-split-error mt-1 text-sm font-medium leading-snug text-danger')}>
                  {t(`splitError.${splitResult.error}` as MessageKey)}
                </div>
              )}

              <SplitPeopleSheet
                open={peopleSheetOpen}
                onClose={() => setPeopleSheetOpen(false)}
                people={formPeople}
                chosen={included}
                onChange={setIncluded}
                me={me}
                recent={recent}
                extra={splitExtra}
              />
            </>
          )}
        </div>

        {view.me.kind === 'guest' && (
          <p className={cn('fsl-expense-form__guest-note m-0 text-center text-xs text-muted-foreground leading-normal')}>
            {t('expenseForm.guestNote')}
          </p>
        )}
      </form>
    </Screen>
  );
}

export function ExpenseForm() {
  const { tripId } = useTrip();
  const { expenseId, incomeId } = useParams<{ expenseId?: string; incomeId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const t = useT();
  // Polls like the trip page, so someone removed elsewhere drops off the split before it is saved.
  const { view, error: tripError, isLoading, refetch } = useTripView(tripId, 20000, { stopAfterMs: 15 * 60_000 });
  // Quick expenses live in a hidden trip: leaving goes back to Home, not to that trip's page.
  const leave = useLeaveForm(tripId, view?.trip.preset === 'direct' ? '/trips' : undefined);

  const isEdit = Boolean(expenseId);
  const title = incomeId
    ? t('fund.editTitle')
    : isEdit
      ? t('expenseForm.titleEdit')
      : t('expenseForm.titleNew');
  const wantsIncome = searchParams.get('type') === 'income';

  if (isLoading || !view) {
    if (incomeId || wantsIncome) {
      return (
        <Screen title={incomeId ? title : t('fund.addTitle')} onBack={leave}>
          <div className={cn('fsl-expense-form flex flex-col gap-4 w-full')}>
            {[30, 20, 25].map((w) => (
              <div className={cn('fsl-field flex flex-col gap-1.5')} key={w}>
                <Skeleton width={`${w}%`} height={14} />
                <Skeleton width="100%" height={44} radius="md" />
              </div>
            ))}
            <Skeleton width="100%" height={48} radius="md" />
          </div>
        </Screen>
      );
    }
    return (
      <Screen title={title} onBack={leave}>
        <div className={cn('fsl-expense-form flex flex-col gap-4 w-full')}>
          <div className={cn('fsl-field flex flex-col gap-1.5')}>
            <Skeleton width="30%" height={14} />
            <Skeleton width="100%" height={44} radius="md" />
          </div>
          <div className={cn('fsl-field flex flex-col gap-1.5')}>
            <Skeleton width="20%" height={14} />
            <Skeleton width="100%" height={56} radius="md" />
          </div>
          <div className={cn('fsl-field flex flex-col gap-1.5')}>
            <Skeleton width="20%" height={14} />
            <Skeleton width="100%" height={44} radius="md" />
          </div>
          <div className={cn('fsl-field flex flex-col gap-1.5')}>
            <Skeleton width="25%" height={14} />
            <Skeleton width="100%" height={44} radius="md" />
          </div>
          <div className={cn('fsl-expense-form__split-section flex flex-col gap-2')}>
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
        <div className={cn('fsl-expense-form flex flex-col gap-4 w-full')}>
          <InlineError error={tripError} onRetry={refetch} />
        </div>
      </Screen>
    );
  }

  if (incomeId) {
    const income = view.fund?.incomes.find((i) => i.id === incomeId);
    if (!income) {
      return (
        <Screen title={title} onBack={leave}>
          <div className={cn('fsl-expense-form flex flex-col gap-4 w-full')}>
            <InlineError error={{ code: 'NOT_FOUND' }} />
          </div>
        </Screen>
      );
    }
    if (!isFundAdmin(view)) {
      return (
        <Screen title={title} onBack={leave}>
          <div className={cn('fsl-expense-form flex flex-col gap-4 w-full')}>
            <p className={cn('fsl-expense-form__not-yours m-0 text-base leading-normal text-foreground')}>{t('fund.readOnly')}</p>
            <Button variant="secondary" onClick={leave}>{t('common.back')}</Button>
          </div>
        </Screen>
      );
    }
    return <IncomeForm view={view} tripId={tripId} income={income} leave={leave} />;
  }

  // Fund admins adding a new entry choose between an expense and fund income; everyone else just gets the expense form.
  const showSwitcher = isFundAdmin(view) && !expenseId;
  const entryType: EntryType = showSwitcher && wantsIncome ? 'income' : 'expense';
  const switcher = showSwitcher ? (
    <EntryTypeSwitch
      value={entryType}
      onChange={(next) => {
        const params = new URLSearchParams(searchParams);
        if (next === 'income') params.set('type', 'income');
        else params.delete('type');
        setSearchParams(params, { replace: true });
      }}
    />
  ) : undefined;
  if (entryType === 'income') {
    return <IncomeForm view={view} tripId={tripId} switcher={switcher} leave={leave} />;
  }

  const expense = expenseId ? view.expenses.find((e) => e.id === expenseId) : undefined;
  if (expenseId && !expense) {
    return (
      <Screen title={title} onBack={leave}>
        <div className={cn('fsl-expense-form flex flex-col gap-4 w-full')}>
          <InlineError error={{ code: 'NOT_FOUND' }} />
        </div>
      </Screen>
    );
  }

  // An expense paid from the fund also needs a fund admin, even to edit one they added.
  const actor = actorOf(view);
  if (
    expense &&
    (!can(actor, 'edit_expense', { expenseCreatedById: expense.createdById, expenseStatus: expense.status }) ||
      (isFundPaid(expense) && !can(actor, 'manage_fund')))
  ) {
    return (
      <Screen title={title} onBack={leave}>
        <div className={cn('fsl-expense-form flex flex-col gap-4 w-full')}>
          <p className={cn('fsl-expense-form__not-yours m-0 text-base leading-normal text-foreground')}>{t('expense.notYours')}</p>
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
      switcher={switcher}
      leave={leave}
    />
  );
}
