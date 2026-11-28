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
  type CurrencyCode,
  type EventLimitInput,
  type EventSavedResponse,
  type EventView,
} from '@cc/core';
import { useLang, useT } from '@cc/web-i18n';
import { todayLocal } from '@cc/web-util/localDate';
import { useBudgets } from '@cc/web-data-access/budgets';
import { useMyGroups } from '@cc/web-data-access/groups';
import { useWalletDetails } from '@cc/web-data-access/personalMoney';
import {
  useCreateEvent,
  useDeleteEvent,
  useUpdateEvent,
} from '@cc/web-data-access/events';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Modal } from '@cc/web-ui/components/Modal';
import { Pill } from '@cc/web-ui/components/Pill';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Skeleton } from '@cc/web-ui/components/Skeleton';
import { Input } from '@cc/web-ui/components/ui/input';
import { Label } from '@cc/web-ui/components/ui/label';
import { cn } from '@cc/web-ui/lib/utils';
import { CurrencyBadge } from '../CurrencyBadge';
import { parseYmd } from '../budgets/budgetLabels';
import { EventDateRow } from './EventDateRow';
import { EventGroupPicker } from './EventGroupPicker';

export interface EventFormProps {
  open: boolean;
  onClose: () => void;
  event?: EventView;
  onSaved: (res: EventSavedResponse) => void;
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

export function formatEventDate(ymd: string, currentYear: number): string {
  const [y, m, d] = parseYmd(ymd);
  return y === currentYear ? `${d}/${m}` : `${d}/${m}/${y}`;
}

export function formatEventRange(
  start: string,
  end: string | null,
  opts: { currentYear: number; t: ReturnType<typeof useT> },
): string {
  const startText = formatEventDate(start, opts.currentYear);
  if (end === null) {
    return opts.t('events.openRange', { date: startText });
  }
  if (end === start) {
    return startText;
  }
  return `${startText} \u2013 ${formatEventDate(end, opts.currentYear)}`;
}

export function EventForm({ open, onClose, event, onSaved }: EventFormProps): JSX.Element {
  const t = useT();
  const [lang] = useLang();
  const navigate = useNavigate();
  const today = todayLocal();
  const isEdit = Boolean(event);

  const groupsQuery = useMyGroups({ enabled: open });
  const walletsQuery = useWalletDetails();
  const budgetsQuery = useBudgets({ enabled: isEdit && Boolean(event?.budgetId) });

  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();

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
    if (!event?.budgetId) return null;
    return (budgetsQuery.data?.budgets ?? []).find((b) => b.id === event.budgetId) ?? null;
  }, [event?.budgetId, budgetsQuery.data?.budgets]);

  const nameId = useId();
  const startId = useId();
  const endId = useId();
  const countsFromId = useId();
  const limitId = useId();
  const limitErrorId = useId();

  const [name, setName] = useState(() => event?.name ?? '');
  const [start, setStart] = useState(() => event?.start ?? '');
  const [end, setEnd] = useState(() => event?.end ?? '');
  const [countsFrom, setCountsFrom] = useState(() =>
    event ? event.countsFrom : defaultCountsFrom(today, today),
  );
  const [countsFromTouched, setCountsFromTouched] = useState(() => Boolean(event));
  const [countsFromOpen, setCountsFromOpen] = useState(false);
  const [groupIds, setGroupIds] = useState<string[]>(() => (event ? [...event.groupIds] : []));
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [limitText, setLimitText] = useState('');
  const [limitTouched, setLimitTouched] = useState(false);
  const [currency, setCurrency] = useState<CurrencyCode>(() => defaultCurrency);
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [confirmClearEndOpen, setConfirmClearEndOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const resetMutationsRef = useRef(() => {
    createEvent.reset();
    updateEvent.reset();
    deleteEvent.reset();
  });
  resetMutationsRef.current = () => {
    createEvent.reset();
    updateEvent.reset();
    deleteEvent.reset();
  };

  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      if (event) {
        setName(event.name);
        setStart(event.start);
        setEnd(event.end ?? '');
        setCountsFrom(event.countsFrom);
        setCountsFromTouched(true);
        setCountsFromOpen(false);
        setGroupIds([...event.groupIds]);
        setGroupPickerOpen(false);
        setLimitTouched(false);
        setCurrencyTouched(false);
        setConfirmClearEndOpen(false);
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
        setConfirmClearEndOpen(false);
        setConfirmDeleteOpen(false);
      }
      resetMutationsRef.current();
    }
    prevOpenRef.current = open;
  }, [open, event, linkedBudget, today, defaultCurrency]);

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
    availableCurrencies.length > 1 && !(isEdit && Boolean(event?.budgetId));

  const hasStart = YMD_RE.test(start);
  const hasEnd = YMD_RE.test(end);
  const effectiveStart = hasStart ? start : today;

  const effectiveCountsFrom = useMemo(() => {
    if (countsFromTouched) return countsFrom;
    return defaultCountsFrom(effectiveStart, today);
  }, [countsFromTouched, countsFrom, effectiveStart, today]);

  const trimmedName = name.trim();
  const datesOrderValid = !hasEnd || effectiveStart <= end;
  const showRangeError = hasEnd && effectiveStart > end;
  const countsFromValid =
    YMD_RE.test(effectiveCountsFrom) && effectiveCountsFrom <= effectiveStart;

  const trimmedLimit = hasEnd ? limitText.trim() : '';
  const parsedLimit = trimmedLimit !== '' ? parseMoney(trimmedLimit, effectiveCurrency) : null;
  const showLimitError = hasEnd && trimmedLimit !== '' && parsedLimit === null;

  const canSubmit =
    trimmedName.length >= 1 &&
    trimmedName.length <= 30 &&
    datesOrderValid &&
    countsFromValid &&
    !showLimitError;

  const isPending = createEvent.isPending || updateEvent.isPending;
  const activeError = isEdit ? updateEvent.error : createEvent.error;
  const isStopped = Boolean(isEdit && event && event.stoppedAt !== null);

  const willDropLimit = Boolean(
    isEdit && event && event.budgetId !== null && event.end !== null && !hasEnd,
  );

  const submitUpdate = () => {
    if (!event || updateEvent.isPending) return;
    const limitValue: EventLimitInput | null =
      hasEnd && parsedLimit !== null
        ? { amount: parsedLimit, currency: effectiveCurrency }
        : null;
    const limitChanged = limitTouched || currencyTouched || willDropLimit;

    updateEvent.mutate(
      {
        id: event.id,
        input: {
          name: trimmedName,
          start: effectiveStart,
          ...(isStopped ? {} : { end: hasEnd ? end : null }),
          countsFrom: effectiveCountsFrom,
          groupIds,
          ...(limitChanged ? { limit: limitValue } : {}),
        },
      },
      {
        onSuccess: (res) => {
          setConfirmClearEndOpen(false);
          onSaved(res);
        },
      },
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || isPending) return;

    if (event) {
      if (willDropLimit) {
        setConfirmClearEndOpen(true);
        return;
      }
      submitUpdate();
      return;
    }

    const limitValue: EventLimitInput | null =
      hasEnd && parsedLimit !== null
        ? { amount: parsedLimit, currency: effectiveCurrency }
        : null;

    createEvent.mutate(
      {
        name: trimmedName,
        start: effectiveStart,
        end: hasEnd ? end : null,
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

  const handleConfirmDelete = () => {
    if (!event || deleteEvent.isPending) return;
    deleteEvent.mutate(event.id, {
      onSuccess: () => {
        setConfirmDeleteOpen(false);
        onClose();
        navigate('/events', { replace: true });
      },
    });
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={isEdit && event ? event.name : t('events.newEvent')}
      >
        <form
          className="fsl-event-form flex flex-col gap-4"
          data-testid="event-form"
          noValidate
          onSubmit={handleSubmit}
        >
          {/* Name */}
          <div className="fsl-field flex flex-col gap-1.5">
            <Label htmlFor={nameId} className="text-sm font-semibold text-muted-foreground">
              {t('events.nameLabel')}
            </Label>
            <Input
              id={nameId}
              data-testid="event-form-name"
              maxLength={30}
              autoComplete="off"
              className="fsl-input text-base min-h-11"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Dates */}
          <div className="fsl-field flex flex-col gap-2">
            <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
              <EventDateRow
                id={startId}
                label={t('events.startLabel')}
                hint={t('events.startHint')}
                value={start}
                emptyLabel={t('entryDate.today')}
                testId="event-form-start"
                quickToday={today}
                onChange={(nextStart) => {
                  setStart(nextStart);
                  if (
                    countsFromTouched &&
                    YMD_RE.test(nextStart) &&
                    YMD_RE.test(countsFrom) &&
                    countsFrom > nextStart
                  ) {
                    setCountsFrom(nextStart);
                  }
                }}
              />
              <EventDateRow
                id={endId}
                label={t('events.endLabel')}
                hint={t('events.endHint')}
                value={end}
                emptyLabel={t('entryDate.chipPick')}
                testId="event-form-end"
                disabled={isStopped}
                allowClear
                onChange={(nextEnd) => setEnd(nextEnd)}
              />
            </div>

            {showRangeError && (
              <div
                role="alert"
                data-testid="event-form-range-error"
                className="text-sm text-danger"
              >
                {t('transactions.rangeFromAfterTo')}
              </div>
            )}

            {/* Counts-from quiet line (only when a start date is picked) */}
            {hasStart && (
              <>
                <button
                  type="button"
                  data-testid="event-form-counts-from-toggle"
                  aria-expanded={countsFromOpen}
                  onClick={() => setCountsFromOpen((v) => !v)}
                  className="min-h-11 px-1 flex items-center gap-1.5 text-left text-xs text-muted-foreground bg-transparent border-0 cursor-pointer rounded-xl hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span>
                    {t('events.countsFromLine', {
                      date: formatEventDate(effectiveCountsFrom, Number(today.slice(0, 4))),
                    })}
                  </span>
                  <Icon name="edit" size={14} className="text-primary shrink-0" />
                </button>

                {countsFromOpen && (
                  <div className="flex flex-col gap-1">
                    <Input
                      id={countsFromId}
                      data-testid="event-form-counts-from"
                      type="date"
                      max={start}
                      className="fsl-input text-base min-h-11 tabular-nums"
                      value={effectiveCountsFrom}
                      onChange={(e) => {
                        setCountsFrom(e.target.value);
                        setCountsFromTouched(true);
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Groups */}
          <div className="fsl-field flex flex-col gap-1.5">
            <Label className="text-sm font-semibold text-muted-foreground">
              {t('events.groupsLabel')}
            </Label>
            <div className="rounded-xl border border-border bg-card px-3 py-2 flex flex-wrap items-center gap-2 min-h-11">
              {groupIds.map((gid) => {
                const knownName = groupNameById.get(gid);
                const groupsLoading = groupsQuery.isPending && !groupsQuery.data;
                const labelText = knownName ?? (groupsLoading ? '…' : t('events.leftGroup'));
                return (
                  <Pill
                    key={gid}
                    tone="accent"
                    data-testid={`event-form-group-chip-${gid}`}
                    className="gap-0.5 py-0 pl-3 pr-0"
                  >
                    {knownName ? (
                      <span>{knownName}</span>
                    ) : groupsLoading ? (
                      <Skeleton width={56} height={14} radius="sm" />
                    ) : (
                      <span>{t('events.leftGroup')}</span>
                    )}
                    <button
                      type="button"
                      aria-label={t('events.removeGroup', { name: labelText })}
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
                data-testid="event-form-pick-groups"
                className="text-primary px-2"
                onClick={() => setGroupPickerOpen(true)}
              >
                <Icon name="plus" size={16} />
                {t('events.groupsLabel')}
              </Button>
            </div>
            <p className="m-0 text-xs text-muted-foreground">{t('events.groupsHint')}</p>
          </div>

          {/* Limit (shown only when an end date is set) */}
          {hasEnd ? (
            <>
              <div className="fsl-field flex flex-col gap-1.5">
                <Label htmlFor={limitId} className="text-sm font-semibold text-muted-foreground">
                  {t('events.limitLabel')}
                </Label>
                <Input
                  id={limitId}
                  data-testid="event-form-limit"
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
                    data-testid="event-form-limit-preview"
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
                <div className="fsl-field flex flex-col gap-1.5" data-testid="event-form-currency">
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
                          data-testid={`event-form-currency-${code}`}
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
            </>
          ) : (
            <p
              data-testid="event-form-limit-needs-end"
              className="m-0 text-xs text-muted-foreground"
            >
              {t('events.limitNeedsEnd')}
            </p>
          )}

          {activeError && <InlineError error={activeError} />}

          <Button
            type="submit"
            variant="primary"
            block
            loading={isPending}
            disabled={!canSubmit || isPending}
            data-testid="event-form-submit"
          >
            {t('events.save')}
          </Button>

          {isEdit && (
            <Button
              type="button"
              variant="ghost"
              block
              data-testid="event-form-delete"
              className="text-danger border border-danger/30 hover:bg-danger-soft/50"
              onClick={() => setConfirmDeleteOpen(true)}
            >
              {t('events.delete')}
            </Button>
          )}
        </form>
      </Sheet>

      <EventGroupPicker
        open={groupPickerOpen}
        onClose={() => setGroupPickerOpen(false)}
        selectedIds={groupIds}
        onChange={setGroupIds}
      />

      {isEdit && (
        <Modal
          open={confirmClearEndOpen}
          onClose={() => setConfirmClearEndOpen(false)}
          title={event?.name ?? ''}
        >
          <div className="flex flex-col gap-4" data-testid="event-clear-end-confirm">
            <p className="m-0 text-sm text-foreground">{t('events.clearEndConfirm')}</p>
            {updateEvent.error && <InlineError error={updateEvent.error} />}
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="danger"
                block
                loading={updateEvent.isPending}
                data-testid="event-form-clear-end-confirm"
                onClick={submitUpdate}
              >
                {t('common.continue')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                block
                disabled={updateEvent.isPending}
                onClick={() => setConfirmClearEndOpen(false)}
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
          title={t('events.delete')}
        >
          <div className="flex flex-col gap-4" data-testid="event-delete-confirm">
            {deleteEvent.error && <InlineError error={deleteEvent.error} />}
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="danger"
                block
                loading={deleteEvent.isPending}
                data-testid="event-form-delete-confirm"
                onClick={handleConfirmDelete}
              >
                {t('events.delete')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                block
                disabled={deleteEvent.isPending}
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
