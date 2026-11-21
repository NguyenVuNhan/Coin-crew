import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  computeShares,
  owedLines,
  recentDirectPeopleIds,
  type ExpenseView,
  type PersonView,
  type SplitEntry,
  type SplitMode,
  type SplitResult,
  type TripView,
} from '@cc/core';
import { importPerson, useGroupPeople } from '@cc/web-data-access/people';
import { fromEntryValue, readSplitInput } from '@cc/web-util/splitInput';
import type { SplitPeopleSheetProps } from '../SplitPeopleSheet';

export type QuickSplitKind = 'shared' | 'loan';

export interface QuickSplit {
  people: PersonView[];
  chipIds: string[];
  chosen: ReadonlySet<string>;
  toggle(id: string): void;
  setChosen(next: Set<string>): void;
  flipped: boolean;
  setFlipped(v: boolean): void;
  payerId: string;
  setPayerId(id: string): void;
  mode: SplitMode;
  setMode(m: SplitMode): void;
  inputs: Record<string, string>;
  setInput(personId: string, v: string): void;
  splitParticipants: string[];
  result: SplitResult | null;
  outcome: ReturnType<typeof owedLines> | null;
  canFlip: boolean;
  splitExtra: SplitPeopleSheetProps['extra'];
  isDirty: boolean;
  reset(): void;
  loadExpense(expense: ExpenseView, meId: string | null, nextKind: QuickSplitKind): void;
}

type InputsByMode = Record<SplitMode, Record<string, string>>;

function emptyInputsByMode(): InputsByMode {
  return {
    equal: {},
    amounts: {},
    percent: {},
    shares: {},
    adjust: {},
  };
}

function buildSplitEntries(
  mode: SplitMode,
  participants: readonly string[],
  inputs: Record<string, string>,
): { entries: SplitEntry[]; hasInvalid: boolean } {
  const entries: SplitEntry[] = [];
  let hasInvalid = false;

  for (const participantId of participants) {
    const read = readSplitInput(mode, inputs[participantId] ?? '');
    if (read.ok) {
      entries.push({ participantId, value: read.value });
    } else {
      hasInvalid = true;
    }
  }

  return { entries, hasInvalid };
}

/**
 * Pure helper that converts a QuickSplit's current mode, participants, and inputs into the
 * `entries` array expected by `POST /api/trips/<direct>/expenses`.
 */
export function entriesForSave(split: QuickSplit): { participantId: string; value: number }[] {
  const { mode, splitParticipants, inputs, result } = split;

  if (mode === 'equal') {
    return splitParticipants.map((participantId) => ({ participantId, value: 1 }));
  }

  const parsed = splitParticipants.map((participantId) => ({
    participantId,
    read: readSplitInput(mode, inputs[participantId] ?? ''),
  }));

  if (mode === 'amounts') {
    const shareById = new Map(
      result?.ok ? result.shares.map((s) => [s.participantId, s.amount] as const) : [],
    );
    return parsed.map(({ participantId, read }) => {
      if (!read.ok) return { participantId, value: 0 };
      if (read.value !== null) return { participantId, value: read.value };
      return { participantId, value: shareById.get(participantId) ?? 0 };
    });
  }

  if (mode === 'percent') {
    let typedSum = 0;
    let blankCount = 0;
    for (const item of parsed) {
      if (!item.read.ok) continue;
      if (item.read.value === null) blankCount += 1;
      else typedSum += item.read.value;
    }
    const remaining = Math.max(0, 10000 - typedSum);
    const base = blankCount > 0 ? Math.floor(remaining / blankCount) : 0;
    const rem = blankCount > 0 ? remaining % blankCount : 0;
    let blankIdx = 0;

    return parsed.map(({ participantId, read }) => {
      if (!read.ok) return { participantId, value: 0 };
      if (read.value !== null) return { participantId, value: read.value };
      const value = base + (blankIdx < rem ? 1 : 0);
      blankIdx += 1;
      return { participantId, value };
    });
  }

  return parsed.map(({ participantId, read }) => ({
    participantId,
    value: read.ok && read.value !== null ? read.value : 0,
  }));
}

export function useQuickSplit(args: {
  view: TripView | null;
  me: string | null;
  kind: QuickSplitKind;
  amount: number | null;
}): QuickSplit {
  const { view, me, kind, amount } = args;
  const queryClient = useQueryClient();
  const { data: groupPeople } = useGroupPeople();

  const tripId = view?.trip.id ?? null;

  const [chosen, setChosenState] = useState<Set<string>>(() => new Set());
  const [prevKind, setPrevKind] = useState<QuickSplitKind>(kind);
  const [flippedState, setFlippedState] = useState(false);
  const [customPayerId, setCustomPayerId] = useState<string | null>(null);
  const [mode, setModeState] = useState<SplitMode>('equal');
  const [inputsByMode, setInputsByMode] = useState<InputsByMode>(emptyInputsByMode);

  if (prevKind !== kind) {
    setPrevKind(kind);
    setFlippedState(false);
    setCustomPayerId(null);
  }

  const people = useMemo(
    () => (view ? view.people.filter((p) => p.status === 'active') : []),
    [view],
  );

  const chipIds = useMemo(
    () => (view ? recentDirectPeopleIds(view, me ?? '', 4) : []),
    [view, me],
  );

  const otherChosen = useMemo(
    () => [...chosen].filter((id) => id !== me),
    [chosen, me],
  );

  const canFlip =
    kind === 'loan'
      ? chosen.size === 1 && otherChosen.length === 1
      : otherChosen.length > 0;

  if (flippedState && !canFlip) {
    setFlippedState(false);
  }

  const flipped = flippedState && canFlip;

  const payerId = useMemo(() => {
    if (!flipped) return me ?? '';
    if (kind === 'loan') return otherChosen[0] ?? me ?? '';
    if (customPayerId && otherChosen.includes(customPayerId)) return customPayerId;
    return otherChosen[0] ?? me ?? '';
  }, [flipped, kind, me, otherChosen, customPayerId]);

  const splitParticipants = useMemo(() => {
    if (chosen.size === 0) return [];
    if (kind === 'shared') {
      return me ? [me, ...otherChosen] : [...chosen];
    }
    if (flipped) {
      return me ? [me] : [];
    }
    return [...chosen];
  }, [chosen, kind, me, otherChosen, flipped]);

  const inputs = inputsByMode[mode];

  const result = useMemo<SplitResult | null>(() => {
    if (amount === null || amount <= 0 || splitParticipants.length === 0) return null;
    const { entries, hasInvalid } = buildSplitEntries(mode, splitParticipants, inputs);
    if (hasInvalid) return { ok: false, error: 'INVALID_VALUE' };
    return computeShares(amount, mode, entries);
  }, [amount, splitParticipants, mode, inputs]);

  const outcome = useMemo(() => {
    if (!result?.ok || !me) return null;
    return owedLines(result.shares, payerId, me);
  }, [result, payerId, me]);

  const splitCandidates = useMemo(() => {
    if (!tripId || !groupPeople) return [];
    return groupPeople.map((c) => ({
      id: c.participantId,
      name: c.name,
      meta: c.tripName,
    }));
  }, [tripId, groupPeople]);

  const splitExtra = useMemo<SplitPeopleSheetProps['extra']>(() => {
    if (!tripId) return undefined;
    return {
      candidates: splitCandidates,
      onPickCandidate: async (id: string) => {
        const { participantId } = await importPerson({ participantId: id }, queryClient);
        await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
        return participantId;
      },
      onAddName: async (name: string) => {
        const { participantId } = await importPerson({ name, confirmNew: true }, queryClient);
        await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
        return participantId;
      },
    };
  }, [tripId, splitCandidates, queryClient]);

  const toggle = useCallback((id: string) => {
    setChosenState((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setChosen = useCallback((next: Set<string>) => {
    setChosenState(new Set(next));
  }, []);

  const setFlipped = useCallback(
    (v: boolean) => {
      if (v && !canFlip) return;
      setFlippedState(v);
    },
    [canFlip],
  );

  const setPayerId = useCallback((id: string) => {
    setCustomPayerId(id);
  }, []);

  const setMode = useCallback((m: SplitMode) => {
    setModeState(m);
  }, []);

  const setInput = useCallback(
    (personId: string, v: string) => {
      setInputsByMode((prev) => ({
        ...prev,
        [mode]: {
          ...prev[mode],
          [personId]: v,
        },
      }));
    },
    [mode],
  );

  const reset = useCallback(() => {
    setChosenState(new Set());
    setFlippedState(false);
    setCustomPayerId(null);
    setModeState('equal');
    setInputsByMode(emptyInputsByMode());
  }, []);

  const loadExpense = useCallback(
    (expense: ExpenseView, meId: string | null, nextKind: QuickSplitKind) => {
      setPrevKind(nextKind);
      setModeState(expense.mode);
      const nextInputs = emptyInputsByMode();
      if (expense.mode !== 'equal') {
        const modeMap: Record<string, string> = {};
        for (const s of expense.shares) {
          modeMap[s.participantId] = fromEntryValue(expense.mode, s.inputValue);
        }
        nextInputs[expense.mode] = modeMap;
      }
      setInputsByMode(nextInputs);

      const isFlipped = Boolean(meId && expense.payerId !== meId);
      if (nextKind === 'loan') {
        if (isFlipped) {
          setChosenState(new Set([expense.payerId]));
          setFlippedState(true);
          setCustomPayerId(null);
        } else {
          setChosenState(new Set(expense.shares.map((s) => s.participantId)));
          setFlippedState(false);
          setCustomPayerId(null);
        }
      } else {
        const others = new Set(
          expense.shares.map((s) => s.participantId).filter((pid) => pid !== meId),
        );
        if (isFlipped) others.add(expense.payerId);
        setChosenState(others);
        setFlippedState(isFlipped);
        setCustomPayerId(isFlipped ? expense.payerId : null);
      }
    },
    [],
  );

  return {
    people,
    chipIds,
    chosen,
    toggle,
    setChosen,
    flipped,
    setFlipped,
    payerId,
    setPayerId,
    mode,
    setMode,
    inputs,
    setInput,
    splitParticipants,
    result,
    outcome,
    canFlip,
    splitExtra,
    isDirty: chosen.size > 0,
    reset,
    loadExpense,
  };
}
