import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type JSX } from 'react';
import { useNavigate } from 'react-router';
import {
  CURRENCIES,
  budgetPeriodAt,
  defaultCountsFrom,
  firstBudgetPeriod,
  formatMoney,
  limitFor,
  parseMoney,
  travelState,
  type CurrencyCode,
  type TravelLimitInput,
  type TravelSavedResponse,
  type TravelView,
} from '@cc/core';
import { useLang, useT } from '@cc/web-i18n';
import { todayLocal } from '@cc/web-util/localDate';
import { useBudgets } from '@cc/web-data-access/budgets';
import { useMyGroups } from '@cc/web-data-access/groups';
import { useTags, useWalletDetails } from '@cc/web-data-access/personalMoney';
import {
  useCreateTravel,
  useDeleteTravel,
  useUpdateTravel,
} from '@cc/web-data-access/travels';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Modal } from '@cc/web-ui/components/Modal';
import { Pill } from '@cc/web-ui/components/Pill';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Input } from '@cc/web-ui/components/ui/input';
import { Label } from '@cc/web-ui/components/ui/label';
import { cn } from '@cc/web-ui/lib/utils';
import { CurrencyBadge } from '../CurrencyBadge';
import { formatDayMonth, parseYmd } from '../budgets/budgetLabels';
import { TravelGroupPicker } from './TravelGroupPicker';

export interface TravelFormProps {
  open: boolean;
  onClose: () => void;
  travel?: TravelView;
  onSaved: (res: TravelSavedResponse) => void;
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatMinorInput(minor: number, currency: CurrencyCode): string {
  const abs = Math.abs(Math.trunc(minor));
  if (abs === 0) return '';
  if (CURRENCIES[currency].decimals === 0) return String(abs);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`;
}

export function formatTravelRange(start: string, end: string): string {
  const [y1, m1, d1] = parseYmd(start);
  const [y2, m2, d2] = parseYmd(end);
  if (y1 === y2 && m1 === m2) {
    return d1 === d2 ? `${d1}/${m1}` : `${d1}\u2013${d2}/${m2}`;
  }
  if (y1 === y2) {
    return `${d1}/${m1}\u2013${d2}/${m2}`;
  }
  return `${d1}/${m1}/${y1}\u2013${d2}/${m2}/${y2}`;
}

interface OverlapDetails {
  travelId?: string;
  name: string;
  start: string;
  end: string;
}

function extractOverlapError(err: unknown): OverlapDetails | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { code?: unknown; details?: Record<string, unknown> };
  if (e.code !== 'TRAVEL_OVERLAP') return null;
  const outer = e.details;
  const inner =
    outer && typeof outer['details'] === 'object' && outer['details'] !== null
      ? (outer['details'] as Record<string, unknown>)
      : outer;
  if (!inner) return null;
  const name = inner['name'];
  const start = inner['start'];
  const end = inner['end'];
  if (typeof name !== 'string' || typeof start !== 'string' || typeof end !== 'string') {
    return null;
  }
  return {
    travelId: typeof inner['travelId'] === 'string' ? inner['travelId'] : undefined,
    name,
    start,
    end,
  };
}

export function TravelForm({ open, onClose, travel, onSaved }: TravelFormProps): JSX.Element {
  const t = useT();
  const [lang] = useLang();
  const navigate = useNavigate();
  const today = todayLocal();
  const isEdit = Boolean(travel);

  const tagsQuery = useTags();
  const groupsQuery = useMyGroups({ enabled: open });
  const walletsQuery = useWalletDetails();
  const budgetsQuery = useBudgets({ enabled: isEdit && Boolean(travel?.budgetId) });

  const createTravel = useCreateTravel();
  const updateTravel = useUpdateTravel();
  const deleteTravel = useDeleteTravel();

  const tags = tagsQuery.data?.tags ?? [];
  const allGroups = useMemo(
    () => (groupsQuery.data?.items ?? []).filter((g) => g.preset !== 'direct'),
    [groupsQuery.data?.items],
  );
  const groupNameById = useMemo(
    () => new Map(allGroups.map((g) => [g.id, g.name])),
    [allGroups],
  );

  const activeWallets = useMemo(
    () => (walletsQuery.data?.wallets ?? []).filter((w) => !w.archived),
    [walletsQuery.data?.wallets],
  );

  const availableCurrencies = useMemo(() => {
    const seen = new Set<CurrencyCode>();
    for (const w of activeWallets) {
      seen.add(w.currency);
    }
    return Array.from(seen);
  }, [activeWallets]);

  const defaultCurrency: CurrencyCode = useMemo(() => {
    if (availableCurrencies.length === 1) return availableCurrencies[0]!;
    if (availableCurrencies.length === 0 || availableCurrencies.includes('VND')) return 'VND';
    return availableCurrencies[0]!;
  }, [availableCurrencies]);

  const linkedBudget = useMemo(() => {
    if (!travel?.budgetId) return null;
    return (budgetsQuery.data?.budgets ?? []).find((b) => b.id === travel.budgetId) ?? null;
  }, [travel?.budgetId, budgetsQuery.data?.budgets]);

  const nameId = useId();
  const startId = useId();
  const endId = useId();
  const countsFromId = useId();
  const limitId = useId();
  const limitErrorId = useId();

  const [name, setName] = useState(() => travel?.name ?? '');
  const [start, setStart] = useState(() => travel?.start ?? '');
  const [end, setEnd] = useState(() => travel?.end ?? '');
  const [countsFrom, setCountsFrom] = useState(() =>
    travel ? travel.countsFrom : defaultCountsFrom(today, today),
  );
  const [countsFromTouched, setCountsFromTouched] = useState(() => Boolean(travel));
  const [countsFromOpen, setCountsFromOpen] = useState(false);
  const [groupIds, setGroupIds] = useState<string[]>(() => (travel ? [...travel.groupIds] : []));
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [limitText, setLimitText] = useState('');
  const [limitTouched, setLimitTouched] = useState(false);
  const [currency, setCurrency] = useState<CurrencyCode>(() => defaultCurrency);
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const resetMutationsRef = useRef(() => {
    createTravel.reset();
    updateTravel.reset();
    deleteTravel.reset();
  });
  resetMutationsRef.current = () => {
    createTravel.reset();
    updateTravel.reset();
    deleteTravel.reset();
  };

  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      if (travel) {
        setName(travel.name);
        setStart(travel.start);
        setEnd(travel.end);
        setCountsFrom(travel.countsFrom);
        setCountsFromTouched(true);
        setCountsFromOpen(false);
        setGroupIds([...travel.groupIds]);
        setGroupPickerOpen(false);
        setLimitTouched(false);
        setCurrencyTouched(false);
        setConfirmEndOpen(false);
        setConfirmDeleteOpen(false);
        if (linkedBudget) {
          const curPeriod = budgetPeriodAt(linkedBudget, today) ?? firstBudgetPeriod(linkedBudget);
          setLimitText(formatMinorInput(limitFor(linkedBudget, curPeriod), linkedBudget.currency));
          setCurrency(linkedBudget.currency);
        } else {
          setLimitText('');
          setCurrency(defaultCurrency);
        }
      } else {
        setName('');
        setStart('');
        setEnd('');
        setCountsFrom(defaultCountsFrom(today, today));
        setCountsFromTouched(false);
        setCountsFromOpen(false);
        setGroupIds([]);
        setGroupPickerOpen(false);
        setLimitText('');
        setLimitTouched(false);
        setCurrency(defaultCurrency);
        setCurrencyTouched(false);
        setConfirmEndOpen(false);
        setConfirmDeleteOpen(false);
      }
      resetMutationsRef.current();
    }
    prevOpenRef.current = open;
  }, [open, travel, linkedBudget, today, defaultCurrency]);

  // Populate limit when linkedBudget finishes loading in edit mode.
  useEffect(() => {
    if (!open || !isEdit || !linkedBudget || limitTouched) return;
    const curPeriod = budgetPeriodAt(linkedBudget, today) ?? firstBudgetPeriod(linkedBudget);
    setLimitText(formatMinorInput(limitFor(linkedBudget, curPeriod), linkedBudget.currency));
    if (!currencyTouched) {
      setCurrency(linkedBudget.currency);
    }
  }, [open, isEdit, linkedBudget, limitTouched, currencyTouched, today]);

  const effectiveCurrency: CurrencyCode = currencyTouched
    ? currency
    : linkedBudget?.currency ?? defaultCurrency;

  const showCurrencyPicker =
    availableCurrencies.length > 1 && !(isEdit && Boolean(travel?.budgetId));

  const effectiveCountsFrom = useMemo(() => {
    if (countsFromTouched) return countsFrom;
    return defaultCountsFrom(YMD_RE.test(start) ? start : today, today);
  }, [countsFromTouched, countsFrom, start, today]);

  const trimmedName = name.trim();
  const datesFilled = YMD_RE.test(start) && YMD_RE.test(end);
  const datesOrderValid = datesFilled && start <= end;
  const showRangeError = datesFilled && start > end;
  const countsFromValid =
    YMD_RE.test(effectiveCountsFrom) && (!YMD_RE.test(start) || effectiveCountsFrom <= start);

  const trimmedLimit = limitText.trim();
  const parsedLimit = trimmedLimit !== '' ? parseMoney(trimmedLimit, effectiveCurrency) : null;
  const showLimitError = trimmedLimit !== '' && parsedLimit === null;

  const canSubmit =
    trimmedName.length >= 1 &&
    trimmedName.length <= 40 &&
    datesOrderValid &&
    countsFromValid &&
    !showLimitError;

  const isPending = createTravel.isPending || updateTravel.isPending;
  const activeError = isEdit ? updateTravel.error : createTravel.error;
  const overlapError = extractOverlapError(activeError);

  const tagSuggestions = useMemo(() => {
    const q = trimmedName.toLowerCase();
    const list = q
      ? tags.filter((tg) => tg.name.toLowerCase().includes(q) && tg.name.toLowerCase() !== q)
      : tags;
    return list.slice(0, 6);
  }, [tags, trimmedName]);

  const isCurrentlyOn = Boolean(travel && travelState(travel, today) === 'on');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || isPending) return;

    const limitValue: TravelLimitInput | null =
      parsedLimit !== null ? { amount: parsedLimit, currency: effectiveCurrency } : null;

    if (travel) {
      const limitChanged = limitTouched || currencyTouched;
      updateTravel.mutate(
        {
          id: travel.id,
          input: {
            name: trimmedName,
            start,
            end,
            countsFrom: effectiveCountsFrom,
            groupIds,
            ...(limitChanged ? { limit: limitValue } : {}),
          },
        },
        {
          onSuccess: (res) => {
            onSaved(res);
          },
        },
      );
      return;
    }

    createTravel.mutate(
      {
        name: trimmedName,
        start,
        end,
        countsFrom: effectiveCountsFrom,
        groupIds,
        ...(limitValue ? { limit: limitValue } : {}),
      },
      {
        onSuccess: (res) => {
          onSaved(res);
        },
      },
    );
  };

  const handleConfirmEndEarly = () => {
    if (!travel || updateTravel.isPending) return;
    updateTravel.mutate(
      { id: travel.id, input: { endNow: true } },
      {
        onSuccess: (res) => {
          setConfirmEndOpen(false);
          onSaved(res);
        },
      },
    );
  };

  const handleConfirmDelete = () => {
    if (!travel || deleteTravel.isPending) return;
    deleteTravel.mutate(travel.id, {
      onSuccess: () => {
        setConfirmDeleteOpen(false);
        onClose();
        navigate('/travels', { replace: true });
      },
    });
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={isEdit && travel ? travel.name : t('travels.newTrip')}
      >
        <form
          className="fsl-travel-form flex flex-col gap-4"
          data-testid="travel-form"
          noValidate
          onSubmit={handleSubmit}
        >
          {/* Name + tag suggestions */}
          <div className="fsl-field flex flex-col gap-1.5">
            <Label htmlFor={nameId} className="text-sm font-semibold text-muted-foreground">
              {t('travels.nameLabel')}
            </Label>
            <Input
              id={nameId}
              data-testid="travel-form-name"
              maxLength={40}
              autoComplete="off"
              className="fsl-input text-base min-h-11"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {tagSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1" data-testid="travel-form-tag-suggestions">
                {tagSuggestions.map((tg) => (
                  <button
                    key={tg.id}
                    type="button"
                    data-testid={`travel-form-tag-suggestion-${tg.id}`}
                    onClick={() => setName(tg.name)}
                    className="min-h-11 px-3 rounded-full bg-muted text-foreground text-sm font-medium border-0 cursor-pointer hover:bg-secondary hover:text-secondary-foreground transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {tg.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Dates */}
          <div className="fsl-field flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-1">
                <Label htmlFor={startId} className="text-sm font-semibold text-muted-foreground">
                  {t('travels.fromLabel')}
                </Label>
                <Input
                  id={startId}
                  data-testid="travel-form-start"
                  type="date"
                  className="fsl-input text-base min-h-11 tabular-nums"
                  value={start}
                  onChange={(e) => {
                    const nextStart = e.target.value;
                    setStart(nextStart);
                    if (
                      countsFromTouched &&
                      YMD_RE.test(nextStart) &&
                      YMD_RE.test(countsFrom) &&
                      countsFrom > nextStart
                    ) {
                      setCountsFrom(nextStart);
                    }
                    if (overlapError) {
                      resetMutationsRef.current();
                    }
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={endId} className="text-sm font-semibold text-muted-foreground">
                  {t('travels.toLabel')}
                </Label>
                <Input
                  id={endId}
                  data-testid="travel-form-end"
                  type="date"
                  className="fsl-input text-base min-h-11 tabular-nums"
                  value={end}
                  onChange={(e) => {
                    setEnd(e.target.value);
                    if (overlapError) {
                      resetMutationsRef.current();
                    }
                  }}
                />
              </div>
            </div>

            {showRangeError && (
              <div
                role="alert"
                data-testid="travel-form-range-error"
                className="text-sm text-danger"
              >
                {t('transactions.rangeFromAfterTo')}
              </div>
            )}

            {overlapError && (
              <div
                role="alert"
                data-testid="travel-form-overlap"
                className="text-sm text-danger"
              >
                {t('travels.overlap', {
                  name: overlapError.name,
                  range: formatTravelRange(overlapError.start, overlapError.end),
                })}
              </div>
            )}

            {/* Counts-from quiet line */}
            <button
              type="button"
              data-testid="travel-form-counts-from-toggle"
              aria-expanded={countsFromOpen}
              onClick={() => setCountsFromOpen((v) => !v)}
              className="min-h-11 px-1 flex items-center gap-1.5 text-left text-xs text-muted-foreground bg-transparent border-0 cursor-pointer rounded-xl hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span>
                {t('travels.countsFromLine', {
                  date: formatDayMonth(effectiveCountsFrom),
                })}
              </span>
              <Icon name="edit" size={14} className="text-primary shrink-0" />
            </button>

            {countsFromOpen && (
              <div className="flex flex-col gap-1">
                <Input
                  id={countsFromId}
                  data-testid="travel-form-counts-from"
                  type="date"
                  max={YMD_RE.test(start) ? start : undefined}
                  className="fsl-input text-base min-h-11 tabular-nums"
                  value={effectiveCountsFrom}
                  onChange={(e) => {
                    setCountsFrom(e.target.value);
                    setCountsFromTouched(true);
                  }}
                />
              </div>
            )}
          </div>

          {/* Groups */}
          <div className="fsl-field flex flex-col gap-1.5">
            <Label className="text-sm font-semibold text-muted-foreground">
              {t('travels.groupsLabel')}
            </Label>
            <div className="rounded-xl border border-border bg-card px-3 py-2 flex flex-wrap items-center gap-2 min-h-11">
              {groupIds.map((gid) => {
                const gName = groupNameById.get(gid) ?? gid;
                return (
                  <Pill
                    key={gid}
                    tone="accent"
                    data-testid={`travel-form-group-chip-${gid}`}
                    className="gap-0.5 py-0 pl-3 pr-0"
                  >
                    <span>{gName}</span>
                    <button
                      type="button"
                      aria-label={t('travels.removeGroup', { name: gName })}
                      onClick={() => setGroupIds((prev) => prev.filter((id) => id !== gid))}
                      className="inline-flex items-center justify-center min-h-11 min-w-11 -my-2 rounded-full bg-transparent border-0 text-secondary-foreground hover:bg-muted cursor-pointer p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </Pill>
                );
              })}
              <Button
                type="button"
                variant="ghost"
                data-testid="travel-form-pick-groups"
                className="text-primary px-2"
                onClick={() => setGroupPickerOpen(true)}
              >
                <Icon name="plus" size={16} />
                {t('travels.groupsLabel')}
              </Button>
            </div>
            <p className="m-0 text-xs text-muted-foreground">{t('travels.groupsHint')}</p>
          </div>

          {/* Limit (optional) */}
          <div className="fsl-field flex flex-col gap-1.5">
            <Label htmlFor={limitId} className="text-sm font-semibold text-muted-foreground">
              {t('travels.limitLabel')}
            </Label>
            <Input
              id={limitId}
              data-testid="travel-form-limit"
              type="text"
              inputMode="text"
              autoComplete="off"
              className="fsl-input fsl-input--amount text-base min-h-11 font-semibold tabular-nums"
              aria-describedby={showLimitError ? limitErrorId : undefined}
              value={limitText}
              onChange={(e) => {
                setLimitText(e.target.value);
                setLimitTouched(true);
              }}
            />
            {trimmedLimit !== '' && parsedLimit !== null && (
              <div
                data-testid="travel-form-limit-preview"
                className="text-sm font-semibold tabular-nums text-muted-foreground"
              >
                {formatMoney(parsedLimit, effectiveCurrency)}
              </div>
            )}
            {showLimitError && (
              <div id={limitErrorId} role="alert" className="text-sm text-danger">
                {t('expenseForm.amountInvalid')}
              </div>
            )}
          </div>

          {showCurrencyPicker && (
            <div className="fsl-field flex flex-col gap-1.5" data-testid="travel-form-currency">
              <Label className="text-sm font-semibold text-muted-foreground">
                {t('budgets.formCurrency')}
              </Label>
              <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                {availableCurrencies.map((code) => {
                  const info = CURRENCIES[code];
                  const selected = effectiveCurrency === code;
                  const cName = lang === 'vi' ? info.nameVi : info.nameEn;
                  return (
                    <button
                      key={code}
                      type="button"
                      data-testid={`travel-form-currency-${code}`}
                      aria-pressed={selected}
                      onClick={() => {
                        setCurrency(code);
                        setCurrencyTouched(true);
                      }}
                      className={cn(
                        'w-full min-h-11 px-3.5 py-2.5 flex items-center gap-3 text-left cursor-pointer bg-transparent border-0 hover:bg-muted transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                        selected && 'bg-secondary/40',
                      )}
                    >
                      <CurrencyBadge code={code} size="sm" selected={selected} />
                      <span className="flex-1 min-w-0 flex flex-col">
                        <span className="text-sm font-semibold text-foreground truncate">
                          {cName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {`${code} · ${info.symbol}`}
                        </span>
                      </span>
                      {selected && (
                        <Icon name="check" size={18} className="text-primary shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeError && !overlapError && <InlineError error={activeError} />}

          <Button
            type="submit"
            variant="primary"
            block
            loading={isPending}
            disabled={!canSubmit || isPending}
            data-testid="travel-form-submit"
          >
            {t('travels.save')}
          </Button>

          {isEdit && isCurrentlyOn && (
            <Button
              type="button"
              variant="ghost"
              block
              data-testid="travel-form-end-early"
              className="text-danger border border-danger/30 hover:bg-danger-soft/50"
              onClick={() => setConfirmEndOpen(true)}
            >
              {t('travels.endEarly')}
            </Button>
          )}

          {isEdit && (
            <Button
              type="button"
              variant="ghost"
              block
              data-testid="travel-form-delete"
              className="text-danger border border-danger/30 hover:bg-danger-soft/50"
              onClick={() => setConfirmDeleteOpen(true)}
            >
              {t('travels.delete')}
            </Button>
          )}
        </form>
      </Sheet>

      <TravelGroupPicker
        open={groupPickerOpen}
        onClose={() => setGroupPickerOpen(false)}
        selectedIds={groupIds}
        onChange={setGroupIds}
      />

      {isEdit && isCurrentlyOn && (
        <Modal
          open={confirmEndOpen}
          onClose={() => setConfirmEndOpen(false)}
          title={t('travels.endEarly')}
        >
          <div className="flex flex-col gap-4" data-testid="travel-end-early-confirm">
            {updateTravel.error && <InlineError error={updateTravel.error} />}
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="danger"
                block
                loading={updateTravel.isPending}
                data-testid="travel-form-end-early-confirm"
                onClick={handleConfirmEndEarly}
              >
                {t('travels.endEarly')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                block
                disabled={updateTravel.isPending}
                onClick={() => setConfirmEndOpen(false)}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {isEdit && (
        <Modal
          open={confirmDeleteOpen}
          onClose={() => setConfirmDeleteOpen(false)}
          title={t('travels.delete')}
        >
          <div className="flex flex-col gap-4" data-testid="travel-delete-confirm">
            {deleteTravel.error && <InlineError error={deleteTravel.error} />}
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="danger"
                block
                loading={deleteTravel.isPending}
                data-testid="travel-form-delete-confirm"
                onClick={handleConfirmDelete}
              >
                {t('travels.delete')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                block
                disabled={deleteTravel.isPending}
                onClick={() => setConfirmDeleteOpen(false)}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
