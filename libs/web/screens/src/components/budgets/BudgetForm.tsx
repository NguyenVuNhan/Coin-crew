import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type JSX } from 'react';
import { useNavigate } from 'react-router';
import {
  CURRENCIES,
  budgetPeriodAt,
  firstBudgetPeriod,
  formatMoney,
  limitFor,
  parseMoney,
  type BudgetDef,
  type BudgetPeriodKind,
  type CreateBudgetInput,
  type CurrencyCode,
  type TagView,
  type WalletDetailView,
} from '@cc/core';
import { useLang, useT } from '@cc/web-i18n';
import { todayLocal } from '@cc/web-util/localDate';
import {
  useBudgets,
  useCreateBudget,
  useDeleteBudget,
  useUpdateBudget,
} from '@cc/web-data-access/budgets';
import {
  useCategories,
  useTags,
  useWalletDetails,
} from '@cc/web-data-access/personalMoney';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';
import { InlineError, ownError } from '@cc/web-ui/components/InlineError';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Checkbox } from '@cc/web-ui/components/ui/checkbox';
import { Input } from '@cc/web-ui/components/ui/input';
import { Label } from '@cc/web-ui/components/ui/label';
import { cn } from '@cc/web-ui/lib/utils';
import { CategoryPicker } from '../CategoryPicker';
import { CurrencyBadge } from '../CurrencyBadge';
import { WalletIcon } from '../WalletIcon';

export interface BudgetFormProps {
  open: boolean;
  onClose: () => void;
  budget?: BudgetDef;
}

const PERIOD_OPTIONS: readonly BudgetPeriodKind[] = ['week', 'month', 'year', 'once'];
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatMinorInput(minor: number, currency: CurrencyCode): string {
  const abs = Math.abs(Math.trunc(minor));
  if (abs === 0) return '';
  if (CURRENCIES[currency].decimals === 0) return String(abs);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`;
}

function defaultExcludedFor(wallets: WalletDetailView[], code: CurrencyCode): string[] {
  return wallets
    .filter((w) => !w.archived && w.currency === code && w.excludeFromReports)
    .map((w) => w.id);
}

function isDuplicateError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: unknown; code?: unknown };
  return e.status === 409 || e.code === 'DUPLICATE';
}

export function BudgetForm({ open, onClose, budget }: BudgetFormProps): JSX.Element {
  const t = useT();
  const [lang] = useLang();
  const navigate = useNavigate();
  const today = todayLocal();

  const isEdit = Boolean(budget);

  const categoriesQuery = useCategories();
  const tagsQuery = useTags();
  const walletsQuery = useWalletDetails();
  const budgetsQuery = useBudgets();

  const createBudget = useCreateBudget();
  const updateBudget = useUpdateBudget();
  const deleteBudget = useDeleteBudget();

  const categories = categoriesQuery.data?.categories ?? [];
  const tags = tagsQuery.data?.tags ?? [];
  const allWallets = walletsQuery.data?.wallets ?? [];
  const existingBudgets = budgetsQuery.data?.budgets ?? [];

  const activeWallets = useMemo(
    () => allWallets.filter((w) => !w.archived),
    [allWallets],
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

  const showCurrencyPicker = !isEdit && availableCurrencies.length > 1;

  const nameId = useId();
  const amountId = useId();
  const amountErrorId = useId();
  const monthStartDayId = useId();
  const fromDateId = useId();
  const toDateId = useId();
  const walletsGroupId = useId();

  const [targetKind, setTargetKind] = useState<'category' | 'tag'>('category');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [tagId, setTagId] = useState<string | null>(null);
  const [name, setName] = useState(() => budget?.name ?? '');
  const [nameDirty, setNameDirty] = useState(() => Boolean(budget));
  const [amountText, setAmountText] = useState(() => {
    if (!budget) return '';
    const curPeriod = budgetPeriodAt(budget, today) ?? firstBudgetPeriod(budget);
    return formatMinorInput(limitFor(budget, curPeriod), budget.currency);
  });
  const [currency, setCurrency] = useState<CurrencyCode>(() => budget?.currency ?? 'VND');
  const [currencyTouched, setCurrencyTouched] = useState(() => Boolean(budget));
  const [excludedWalletIds, setExcludedWalletIds] = useState<string[]>(() =>
    budget ? [...budget.excludedWalletIds] : [],
  );
  const [walletsTouched, setWalletsTouched] = useState(() => Boolean(budget));
  const [periodKind, setPeriodKind] = useState<BudgetPeriodKind>('month');
  const [monthStartDayText, setMonthStartDayText] = useState('1');
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const resetMutationsRef = useRef(() => {
    createBudget.reset();
    updateBudget.reset();
    deleteBudget.reset();
  });
  resetMutationsRef.current = () => {
    createBudget.reset();
    updateBudget.reset();
    deleteBudget.reset();
  };

  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      if (budget) {
        const curPeriod = budgetPeriodAt(budget, today) ?? firstBudgetPeriod(budget);
        const curLimit = limitFor(budget, curPeriod);
        setName(budget.name);
        setNameDirty(true);
        setAmountText(formatMinorInput(curLimit, budget.currency));
        setCurrency(budget.currency);
        setCurrencyTouched(true);
        setExcludedWalletIds([...budget.excludedWalletIds]);
        setWalletsTouched(true);
        setConfirmDeleteOpen(false);
      } else {
        setTargetKind('category');
        setCategoryId(null);
        setTagId(null);
        setName('');
        setNameDirty(false);
        setAmountText('');
        setCurrency(defaultCurrency);
        setCurrencyTouched(false);
        setExcludedWalletIds(defaultExcludedFor(activeWallets, defaultCurrency));
        setWalletsTouched(false);
        setPeriodKind('month');
        setMonthStartDayText('1');
        setFromDate(today);
        setToDate('');
        setConfirmDeleteOpen(false);
      }
      resetMutationsRef.current();
    }
    prevOpenRef.current = open;
  }, [open, budget, today, defaultCurrency, activeWallets]);

  const effectiveCurrency: CurrencyCode = isEdit
    ? budget!.currency
    : currencyTouched
      ? currency
      : defaultCurrency;

  const currencyWallets = useMemo(
    () => activeWallets.filter((w) => w.currency === effectiveCurrency),
    [activeWallets, effectiveCurrency],
  );

  const effectiveExcludedIds = useMemo(() => {
    if (isEdit) {
      return excludedWalletIds;
    }
    if (walletsTouched) {
      const allowed = new Set(currencyWallets.map((w) => w.id));
      return excludedWalletIds.filter((id) => allowed.has(id));
    }
    return defaultExcludedFor(activeWallets, effectiveCurrency);
  }, [isEdit, walletsTouched, excludedWalletIds, currencyWallets, activeWallets, effectiveCurrency]);

  const effectiveExcludedSet = useMemo(
    () => new Set(effectiveExcludedIds),
    [effectiveExcludedIds],
  );

  const selectedCategory = useMemo(
    () => (categoryId ? categories.find((c) => c.id === categoryId) ?? null : null),
    [categories, categoryId],
  );

  const selectedTag = useMemo(
    () => (tagId ? tags.find((tg) => tg.id === tagId) ?? null : null),
    [tags, tagId],
  );

  const selectedTargetName =
    targetKind === 'category' ? selectedCategory?.name ?? '' : selectedTag?.name ?? '';

  const handleSelectCategory = (id: string) => {
    setCategoryId(id);
    if (!nameDirty) {
      const cat = categories.find((c) => c.id === id);
      if (cat) setName(cat.name);
    }
  };

  const handleSelectTag = (tag: TagView) => {
    setTagId(tag.id);
    if (!nameDirty) {
      setName(tag.name);
    }
  };

  const handleSwitchTargetKind = (next: 'category' | 'tag') => {
    if (next === targetKind) return;
    setTargetKind(next);
    if (!nameDirty) {
      if (next === 'category') {
        setName(selectedCategory?.name ?? '');
      } else {
        setName(selectedTag?.name ?? '');
      }
    }
  };

  const handleSelectCurrency = (next: CurrencyCode) => {
    setCurrency(next);
    setCurrencyTouched(true);
    setExcludedWalletIds(defaultExcludedFor(activeWallets, next));
    setWalletsTouched(false);
  };

  const handleToggleWallet = (walletId: string, checked: boolean) => {
    const next = new Set(effectiveExcludedIds);
    if (checked) {
      next.delete(walletId);
    } else {
      next.add(walletId);
    }
    setExcludedWalletIds(Array.from(next));
    setWalletsTouched(true);
  };

  const trimmedAmount = amountText.trim();
  const parsedAmount = trimmedAmount !== '' ? parseMoney(trimmedAmount, effectiveCurrency) : null;
  const showAmountError = trimmedAmount !== '' && parsedAmount === null;

  const trimmedName = name.trim();
  const effectiveName = isEdit ? trimmedName : trimmedName || selectedTargetName;

  const parsedMonthStartDay = useMemo(() => {
    if (periodKind !== 'month') return 1;
    const raw = monthStartDayText.trim();
    if (!/^\d+$/.test(raw)) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
  }, [periodKind, monthStartDayText]);

  const showMonthStartDayError =
    !isEdit && periodKind === 'month' && parsedMonthStartDay === null;

  const onceDatesValid =
    periodKind !== 'once' ||
    (YMD_RE.test(fromDate) && YMD_RE.test(toDate) && fromDate <= toDate);

  const showOnceRangeError =
    !isEdit &&
    periodKind === 'once' &&
    YMD_RE.test(fromDate) &&
    YMD_RE.test(toDate) &&
    fromDate > toDate;

  const hasTarget = isEdit || (targetKind === 'category' ? Boolean(categoryId) : Boolean(tagId));

  const canSubmit =
    hasTarget &&
    effectiveName.length >= 1 &&
    effectiveName.length <= 40 &&
    parsedAmount !== null &&
    (isEdit || (parsedMonthStartDay !== null && onceDatesValid));

  const isPending = createBudget.isPending || updateBudget.isPending;
  const activeError = isEdit ? updateBudget.error : createBudget.error;

  const displayError = useMemo(() => {
    if (!activeError) return null;
    if (!isEdit && isDuplicateError(activeError)) {
      const existing = existingBudgets.find(
        (b) =>
          b.periodKind === periodKind &&
          ((targetKind === 'category' &&
            b.target.kind === 'category' &&
            b.target.categoryId === categoryId) ||
            (targetKind === 'tag' &&
              b.target.kind === 'tag' &&
              b.target.tagId === tagId)),
      );
      const dupName = existing?.name || selectedTargetName || trimmedName;
      return ownError(t('budgets.duplicateError', { name: dupName }));
    }
    return activeError;
  }, [
    activeError,
    isEdit,
    existingBudgets,
    periodKind,
    targetKind,
    categoryId,
    tagId,
    selectedTargetName,
    trimmedName,
    t,
  ]);

  const currentLimit = useMemo(() => {
    if (!budget) return null;
    const curPeriod = budgetPeriodAt(budget, today) ?? firstBudgetPeriod(budget);
    return limitFor(budget, curPeriod);
  }, [budget, today]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || isPending || parsedAmount === null) return;

    if (budget) {
      updateBudget.mutate(
        {
          id: budget.id,
          input: {
            name: effectiveName,
            ...(parsedAmount !== currentLimit ? { amount: parsedAmount } : {}),
            excludedWalletIds: effectiveExcludedIds,
            today,
          },
        },
        { onSuccess: onClose },
      );
      return;
    }

    const target =
      targetKind === 'category'
        ? ({ kind: 'category', categoryId: categoryId! } as const)
        : ({ kind: 'tag', tagId: tagId! } as const);

    const input: CreateBudgetInput = {
      name: effectiveName,
      target,
      currency: effectiveCurrency,
      amount: parsedAmount,
      periodKind,
      ...(periodKind === 'month' ? { monthStartDay: parsedMonthStartDay ?? 1 } : {}),
      ...(periodKind === 'once' ? { from: fromDate, to: toDate } : {}),
      excludedWalletIds: effectiveExcludedIds,
      today,
    };

    createBudget.mutate(input, {
      onSuccess: (res) => {
        navigate(`/budgets/${encodeURIComponent(res.budget.id)}`, { replace: true });
      },
    });
  };

  const handleConfirmDelete = () => {
    if (!budget || deleteBudget.isPending) return;
    deleteBudget.mutate(budget.id, {
      onSuccess: () => {
        setConfirmDeleteOpen(false);
        navigate('/budgets', { replace: true });
      },
    });
  };

  const periodLabel = (kind: BudgetPeriodKind): string => {
    switch (kind) {
      case 'week':
        return t('budgets.periodWeek');
      case 'month':
        return t('budgets.periodMonth');
      case 'year':
        return t('budgets.periodYear');
      case 'once':
        return t('budgets.periodOnce');
    }
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={isEdit ? t('budgets.edit') : t('budgets.add')}
      >
        <form
          className="fsl-budget-form flex flex-col gap-4"
          data-testid="budget-form"
          noValidate
          onSubmit={handleSubmit}
        >
          {/* Create-only: What (Category or Tag) */}
          {!isEdit && (
            <div className="fsl-field flex flex-col gap-2">
              <Label className="text-sm font-semibold text-muted-foreground">
                {t('budgets.formWhat')}
              </Label>
              <div
                className="grid grid-cols-2 gap-2"
                role="group"
                aria-label={t('budgets.formWhat')}
              >
                {(['category', 'tag'] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    data-testid={`budget-form-target-${kind}`}
                    aria-pressed={targetKind === kind}
                    onClick={() => handleSwitchTargetKind(kind)}
                    className={cn(
                      'min-h-11 rounded-xl border px-3 text-sm font-semibold transition-colors motion-reduce:transition-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      targetKind === kind
                        ? 'border-primary bg-secondary text-secondary-foreground'
                        : 'border-border bg-card text-foreground hover:bg-muted',
                    )}
                  >
                    {kind === 'category'
                      ? t('budgets.targetCategory')
                      : t('budgets.targetTag')}
                  </button>
                ))}
              </div>

              {targetKind === 'category' ? (
                <div className="rounded-xl border border-border bg-card p-3">
                  <CategoryPicker
                    type="expense"
                    categories={categories}
                    recentIds={[]}
                    value={categoryId}
                    onChange={handleSelectCategory}
                  />
                </div>
              ) : (
                <div
                  data-testid="budget-form-tag-list"
                  className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden"
                >
                  {tags.length === 0 ? (
                    <p className="m-0 px-3.5 py-3 text-sm text-muted-foreground">
                      {t('budgets.noTags')}
                    </p>
                  ) : (
                    tags.map((tag) => {
                      const selected = tagId === tag.id;
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          data-testid={`budget-form-tag-${tag.id}`}
                          aria-pressed={selected}
                          onClick={() => handleSelectTag(tag)}
                          className={cn(
                            'w-full min-h-11 px-3.5 py-2.5 flex items-center gap-3 text-left text-base cursor-pointer bg-transparent border-0 hover:bg-muted transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                            selected
                              ? 'text-primary font-semibold'
                              : 'text-foreground font-medium',
                          )}
                        >
                          <span className="size-8 rounded-xl bg-secondary text-secondary-foreground flex items-center justify-center shrink-0">
                            <Icon name="tag" size={16} />
                          </span>
                          <span className="flex-1 truncate">{tag.name}</span>
                          {selected && (
                            <Icon name="check" size={18} className="text-primary shrink-0" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}

          {/* Edit-only: Name first (or Create: Name at bottom — spec §4.3 puts name after period on create, and edit shows name, amount, wallets) */}
          {isEdit && (
            <div className="fsl-field flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label
                  htmlFor={nameId}
                  className="text-sm font-semibold text-muted-foreground"
                >
                  {t('budgets.formName')}
                </Label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {`${name.length}/40`}
                </span>
              </div>
              <Input
                id={nameId}
                data-testid="budget-form-name"
                maxLength={40}
                autoComplete="off"
                className="fsl-input text-base min-h-11"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameDirty(true);
                }}
              />
            </div>
          )}

          {/* Amount */}
          <div className="fsl-field flex flex-col gap-1.5">
            <Label
              htmlFor={amountId}
              className="text-sm font-semibold text-muted-foreground"
            >
              {t('budgets.formAmount')}
            </Label>
            <Input
              id={amountId}
              data-testid="budget-form-amount"
              type="text"
              inputMode="text"
              autoComplete="off"
              className="fsl-input fsl-input--amount text-base min-h-11 font-semibold tabular-nums"
              aria-describedby={showAmountError ? amountErrorId : undefined}
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
            />
            {trimmedAmount !== '' && parsedAmount !== null && (
              <div
                data-testid="budget-form-amount-preview"
                className="text-sm font-semibold tabular-nums text-muted-foreground"
              >
                {formatMoney(parsedAmount, effectiveCurrency)}
              </div>
            )}
            {showAmountError && (
              <div
                id={amountErrorId}
                role="alert"
                className="fsl-field-error text-sm text-danger"
              >
                {t('expenseForm.amountInvalid')}
              </div>
            )}
          </div>

          {/* Create-only: Currency (only when >1 currency exists across active wallets) */}
          {showCurrencyPicker && (
            <div className="fsl-field flex flex-col gap-1.5" data-testid="budget-form-currency">
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
                      data-testid={`budget-form-currency-${code}`}
                      aria-pressed={selected}
                      onClick={() => handleSelectCurrency(code)}
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

          {/* Wallets */}
          <div className="fsl-field flex flex-col gap-1.5" data-testid="budget-form-wallets">
            <Label className="text-sm font-semibold text-muted-foreground">
              {t('budgets.formWallets')}
            </Label>
            <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
              {currencyWallets.length === 0 ? (
                <p className="m-0 px-3.5 py-3 text-sm text-muted-foreground">
                  {t('budgets.noWallets')}
                </p>
              ) : (
                currencyWallets.map((w) => {
                  const checked = !effectiveExcludedSet.has(w.id);
                  const checkboxId = `${walletsGroupId}-${w.id}`;
                  return (
                    <Label
                      key={w.id}
                      htmlFor={checkboxId}
                      data-testid={`budget-form-wallet-${w.id}`}
                      className="min-h-11 px-3.5 py-2.5 flex items-center gap-3 font-normal cursor-pointer hover:bg-muted transition-colors motion-reduce:transition-none"
                    >
                      <Checkbox
                        id={checkboxId}
                        data-testid={`budget-form-wallet-check-${w.id}`}
                        checked={checked}
                        onCheckedChange={(next) => handleToggleWallet(w.id, next === true)}
                      />
                      <WalletIcon icon={w.icon} size="xs" />
                      <div className="flex-1 min-w-0 flex flex-col">
                        <span className="text-sm font-medium text-foreground truncate">
                          {w.name}
                        </span>
                        {w.excludeFromReports && (
                          <span className="text-xs text-muted-foreground">
                            {t('budgets.walletExcludedHint')}
                          </span>
                        )}
                      </div>
                    </Label>
                  );
                })
              )}
            </div>
          </div>

          {/* Create-only: Period */}
          {!isEdit && (
            <div className="fsl-field flex flex-col gap-2" data-testid="budget-form-period">
              <Label className="text-sm font-semibold text-muted-foreground">
                {t('budgets.formPeriod')}
              </Label>
              <div
                className="grid grid-cols-2 gap-2"
                role="group"
                aria-label={t('budgets.formPeriod')}
              >
                {PERIOD_OPTIONS.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    data-testid={`budget-form-period-${kind}`}
                    aria-pressed={periodKind === kind}
                    onClick={() => setPeriodKind(kind)}
                    className={cn(
                      'min-h-11 rounded-xl border px-3 text-sm font-semibold transition-colors motion-reduce:transition-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      periodKind === kind
                        ? 'border-primary bg-secondary text-secondary-foreground'
                        : 'border-border bg-card text-foreground hover:bg-muted',
                    )}
                  >
                    {periodLabel(kind)}
                  </button>
                ))}
              </div>

              {periodKind === 'month' && (
                <div className="rounded-xl border border-border bg-card px-3.5 py-3 flex flex-col gap-1.5">
                  <Label
                    htmlFor={monthStartDayId}
                    className="text-sm font-semibold text-muted-foreground"
                  >
                    {t('budgets.monthStartDay')}
                  </Label>
                  <Input
                    id={monthStartDayId}
                    data-testid="budget-form-month-start-day"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={31}
                    className="fsl-input text-base min-h-11 tabular-nums"
                    value={monthStartDayText}
                    onChange={(e) => setMonthStartDayText(e.target.value)}
                  />
                  {showMonthStartDayError && (
                    <div role="alert" className="text-sm text-danger">
                      {t('budgets.monthStartDayError')}
                    </div>
                  )}
                </div>
              )}

              {periodKind === 'once' && (
                <div className="rounded-xl border border-border bg-card px-3.5 py-3 flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="flex flex-col gap-1">
                      <Label
                        htmlFor={fromDateId}
                        className="text-sm font-semibold text-muted-foreground"
                      >
                        {t('transactions.fromDate')}
                      </Label>
                      <Input
                        id={fromDateId}
                        data-testid="budget-form-from"
                        type="date"
                        className="fsl-input text-base min-h-11 tabular-nums"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label
                        htmlFor={toDateId}
                        className="text-sm font-semibold text-muted-foreground"
                      >
                        {t('transactions.toDate')}
                      </Label>
                      <Input
                        id={toDateId}
                        data-testid="budget-form-to"
                        type="date"
                        className="fsl-input text-base min-h-11 tabular-nums"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                      />
                    </div>
                  </div>
                  {showOnceRangeError && (
                    <div
                      role="alert"
                      data-testid="budget-form-range-error"
                      className="text-sm text-danger"
                    >
                      {t('transactions.rangeFromAfterTo')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Create-only: Name (defaults to target name) */}
          {!isEdit && (
            <div className="fsl-field flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label
                  htmlFor={nameId}
                  className="text-sm font-semibold text-muted-foreground"
                >
                  {t('budgets.formName')}
                </Label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {`${name.length}/40`}
                </span>
              </div>
              <Input
                id={nameId}
                data-testid="budget-form-name"
                maxLength={40}
                autoComplete="off"
                placeholder={t('budgets.formNamePlaceholder')}
                className="fsl-input text-base min-h-11"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameDirty(e.target.value.trim().length > 0);
                }}
              />
            </div>
          )}

          {displayError && <InlineError error={displayError} />}

          <Button
            type="submit"
            variant="primary"
            block
            loading={isPending}
            disabled={!canSubmit || isPending}
            data-testid="budget-form-submit"
          >
            {t('budgets.save')}
          </Button>

          {isEdit && (
            <Button
              type="button"
              variant="ghost"
              block
              data-testid="budget-form-remove"
              className="text-danger border border-danger/30 hover:bg-danger-soft/50"
              onClick={() => setConfirmDeleteOpen(true)}
            >
              {t('budgets.remove')}
            </Button>
          )}
        </form>
      </Sheet>

      {isEdit && (
        <Sheet
          open={confirmDeleteOpen}
          onClose={() => setConfirmDeleteOpen(false)}
          title={t('budgets.remove')}
        >
          <div className="flex flex-col gap-4" data-testid="budget-remove-confirm-sheet">
            <p className="m-0 text-sm text-foreground leading-relaxed">
              {t('budgets.removeConfirm')}
            </p>
            {deleteBudget.error && <InlineError error={deleteBudget.error} />}
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="danger"
                block
                loading={deleteBudget.isPending}
                data-testid="budget-form-remove-confirm"
                onClick={handleConfirmDelete}
              >
                {t('budgets.remove')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                block
                disabled={deleteBudget.isPending}
                data-testid="budget-form-remove-cancel"
                onClick={() => setConfirmDeleteOpen(false)}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
