import { useEffect, useMemo, useState, type JSX } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  CURRENCIES,
  formatMoney,
  type CurrencyCode,
  type EntryInput,
  type EntryView,
  type ListResponse,
  type WalletDetailView,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import {
  PERSONAL_LIST_KEY,
  readLastWallet,
  useCategories,
  useCreateEntry,
  usePersonalList,
  useUpdateEntry,
  useWalletDetails,
  writeLastWallet,
} from '@cc/web-data-access/personalMoney';
import { Amount } from '@cc/web-ui/components/Amount';
import { AmountKeypad } from '@cc/web-ui/components/AmountKeypad';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { Icon } from '@cc/web-ui/components/icons';
import { InlineError, ownError } from '@cc/web-ui/components/InlineError';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { Input } from '@cc/web-ui/components/ui/input';
import { Label } from '@cc/web-ui/components/ui/label';
import { Switch } from '@cc/web-ui/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@cc/web-ui/components/ui/tabs';
import { cn } from '@cc/web-ui/lib/utils';
import { CategoryPicker } from '../components/CategoryPicker';
import { TagInput } from '../components/TagInput';
import { showUndo } from '../components/UndoSnackbarHost';
import { useBack } from '../lib/navHistory';

type FormEntryType = 'expense' | 'income' | 'transfer';

const OPERATOR_SPLIT_RE = /([+\-\u2212])/;

function parseTermMinor(term: string, decimals: 0 | 2): number | null {
  if (decimals === 0) {
    if (!/^\d+$/.test(term)) return null;
    const value = Number(term);
    return Number.isSafeInteger(value) ? value : null;
  }
  const match = /^(\d+)(?:,(\d{1,2}))?$/.exec(term);
  if (!match) return null;
  const whole = Number(match[1]);
  const frac = Number((match[2] ?? '').padEnd(2, '0'));
  const minor = whole * 100 + frac;
  return Number.isSafeInteger(minor) ? minor : null;
}

function evaluateAmountExpression(expr: string, code: CurrencyCode): number | null {
  if (!expr) return null;
  const info = CURRENCIES[code];
  const parts = expr.split(OPERATOR_SPLIT_RE);
  if (parts.length % 2 === 0) return null;
  const first = parseTermMinor(parts[0] ?? '', info.decimals);
  if (first === null) return null;
  let total = first;
  for (let i = 1; i < parts.length; i += 2) {
    const op = parts[i];
    const rhs = parseTermMinor(parts[i + 1] ?? '', info.decimals);
    if (rhs === null) return null;
    total = op === '+' ? total + rhs : total - rhs;
    if (!Number.isSafeInteger(total)) return null;
  }
  if (total <= 0 || total > info.max) return null;
  return total;
}

function formatKeypadValue(minor: number, code: CurrencyCode): string {
  if (CURRENCIES[code].decimals === 0) return String(Math.trunc(minor));
  const abs = Math.abs(Math.trunc(minor));
  return `${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

function getTodayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseInitialType(raw: string | null): FormEntryType {
  if (raw === 'income' || raw === 'transfer') return raw;
  return 'expense';
}

function formatImpliedRate(
  fromCur: CurrencyCode,
  toCur: CurrencyCode,
  sentMinor: number,
  receivedMinor: number,
): string {
  const sentMajor = sentMinor / 10 ** CURRENCIES[fromCur].decimals;
  const recMajor = receivedMinor / 10 ** CURRENCIES[toCur].decimals;
  if (sentMajor <= 0 || recMajor <= 0) return '';

  if (fromCur === 'VND' && toCur !== 'VND') {
    const vndPerUnit = Math.round(sentMajor / recMajor);
    return `1 ${toCur} ≈ ${formatMoney(vndPerUnit, 'VND')}`;
  }
  if (toCur === 'VND' && fromCur !== 'VND') {
    const vndPerUnit = Math.round(recMajor / sentMajor);
    return `1 ${fromCur} ≈ ${formatMoney(vndPerUnit, 'VND')}`;
  }
  const ratio = recMajor / sentMajor;
  return `1 ${fromCur} ≈ ${ratio.toLocaleString('vi-VN', { maximumFractionDigits: 4 })} ${toCur}`;
}

function pickDefaultWallet(activeWallets: WalletDetailView[]): string {
  const lastId = readLastWallet();
  if (lastId && activeWallets.some((w) => w.id === lastId)) {
    return lastId;
  }
  return (activeWallets.find((w) => w.isDefault) ?? activeWallets[0])?.id ?? '';
}

export function EntryPage(): JSX.Element {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { goBack } = useBack('/trips');

  const stateEntry = (location.state as { entry?: EntryView } | null)?.entry;

  const cachedEntry = useMemo(() => {
    if (!id || stateEntry) return stateEntry ?? null;
    const cachedLists = queryClient.getQueriesData<ListResponse>({ queryKey: PERSONAL_LIST_KEY });
    for (const [, data] of cachedLists) {
      if (!data) continue;
      for (const row of data.rows) {
        if (row.kind === 'entry' && row.entry.id === id) {
          return row.entry;
        }
      }
    }
    return null;
  }, [id, stateEntry, queryClient]);

  const monthParam = searchParams.get('month') ?? getTodayLocalDate().slice(0, 7);
  const listQuery = usePersonalList(
    { month: monthParam },
    { enabled: isEdit && !cachedEntry },
  );

  const entry = useMemo(() => {
    if (cachedEntry) return cachedEntry;
    if (!id || !listQuery.data) return null;
    for (const row of listQuery.data.rows) {
      if (row.kind === 'entry' && row.entry.id === id) {
        return row.entry;
      }
    }
    return null;
  }, [cachedEntry, id, listQuery.data]);

  const counterpartEntry = useMemo(() => {
    if (!entry?.transferId) return null;
    const cachedLists = queryClient.getQueriesData<ListResponse>({ queryKey: PERSONAL_LIST_KEY });
    for (const [, data] of cachedLists) {
      if (!data) continue;
      for (const row of data.rows) {
        if (
          row.kind === 'entry' &&
          row.entry.transferId === entry.transferId &&
          row.entry.id !== entry.id
        ) {
          return row.entry;
        }
      }
    }
    if (listQuery.data) {
      for (const row of listQuery.data.rows) {
        if (
          row.kind === 'entry' &&
          row.entry.transferId === entry.transferId &&
          row.entry.id !== entry.id
        ) {
          return row.entry;
        }
      }
    }
    return null;
  }, [entry, queryClient, listQuery.data]);

  const walletsQuery = useWalletDetails();
  const categoriesQuery = useCategories();
  const createEntry = useCreateEntry();
  const updateEntry = useUpdateEntry();

  const activeWallets = useMemo(
    () => (walletsQuery.data?.wallets ?? []).filter((w) => !w.archived),
    [walletsQuery.data?.wallets],
  );

  const [entryType, setEntryType] = useState<FormEntryType>(() =>
    parseInitialType(searchParams.get('type')),
  );
  const [walletId, setWalletId] = useState('');
  const [fromWalletId, setFromWalletId] = useState('');
  const [toWalletId, setToWalletId] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [amountExpr, setAmountExpr] = useState('');
  const [receivedExpr, setReceivedExpr] = useState('');
  const [activeTransferField, setActiveTransferField] = useState<'sent' | 'received'>('sent');
  const [date, setDate] = useState(() => getTodayLocalDate());
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [excludeFromReports, setExcludeFromReports] = useState(
    () => parseInitialType(searchParams.get('type')) === 'transfer',
  );
  const [excludeTouched, setExcludeTouched] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [walletSheetTarget, setWalletSheetTarget] = useState<'single' | 'from' | 'to' | null>(null);
  const [validationError, setValidationError] = useState<unknown>(null);
  const [initializedId, setInitializedId] = useState<string | null>(null);
  const [walletDefaultsApplied, setWalletDefaultsApplied] = useState(false);

  // Initialize default wallets in new mode
  useEffect(() => {
    if (isEdit || walletDefaultsApplied || activeWallets.length === 0) return;
    const defId = pickDefaultWallet(activeWallets);
    const otherId = activeWallets.find((w) => w.id !== defId)?.id ?? '';
    setWalletId(defId);
    setFromWalletId(defId);
    setToWalletId(otherId);
    setWalletDefaultsApplied(true);
  }, [isEdit, walletDefaultsApplied, activeWallets]);

  // Initialize form from loaded entry in edit mode
  useEffect(() => {
    if (!isEdit || !entry || initializedId === entry.id) return;
    const isTransfer = entry.type === 'transfer_out' || entry.type === 'transfer_in';
    const nextType: FormEntryType =
      entry.type === 'transfer_out' || entry.type === 'transfer_in' ? 'transfer' : entry.type;
    setEntryType(nextType);

    if (isTransfer) {
      if (entry.type === 'transfer_out') {
        setFromWalletId(entry.walletId);
        setToWalletId(entry.counterpartWalletId ?? '');
        setAmountExpr(formatKeypadValue(entry.amount, entry.currency));
        if (counterpartEntry) {
          setReceivedExpr(formatKeypadValue(counterpartEntry.amount, counterpartEntry.currency));
        }
      } else {
        setFromWalletId(entry.counterpartWalletId ?? '');
        setToWalletId(entry.walletId);
        setReceivedExpr(formatKeypadValue(entry.amount, entry.currency));
        if (counterpartEntry) {
          setAmountExpr(formatKeypadValue(counterpartEntry.amount, counterpartEntry.currency));
        }
      }
    } else {
      setWalletId(entry.walletId);
      setCategoryId(entry.categoryId);
      setAmountExpr(formatKeypadValue(entry.amount, entry.currency));
    }

    setDate(entry.date);
    setTime(entry.time ?? '');
    setNote(entry.note ?? '');
    setTags(entry.tags);
    setExcludeFromReports(entry.excludeFromReports);
    setExcludeTouched(true);
    if (entry.time || entry.tags.length > 0 || entry.excludeFromReports !== isTransfer) {
      setShowMore(true);
    }
    setInitializedId(entry.id);
  }, [isEdit, entry, counterpartEntry, initializedId]);

  const selectedWallet = useMemo(
    () => activeWallets.find((w) => w.id === walletId) ?? activeWallets[0],
    [activeWallets, walletId],
  );
  const fromWallet = useMemo(
    () => activeWallets.find((w) => w.id === fromWalletId) ?? activeWallets[0],
    [activeWallets, fromWalletId],
  );
  const toWallet = useMemo(
    () =>
      activeWallets.find((w) => w.id === toWalletId) ??
      activeWallets.find((w) => w.id !== fromWallet?.id),
    [activeWallets, toWalletId, fromWallet?.id],
  );

  const isDiffCurrencyTransfer =
    entryType === 'transfer' &&
    Boolean(fromWallet && toWallet && fromWallet.currency !== toWallet.currency);

  const activeCurrency: CurrencyCode =
    entryType === 'transfer'
      ? activeTransferField === 'received' && isDiffCurrencyTransfer && toWallet
        ? toWallet.currency
        : (fromWallet?.currency ?? 'VND')
      : (selectedWallet?.currency ?? 'VND');

  const activeExpr =
    entryType === 'transfer' && activeTransferField === 'received' && isDiffCurrencyTransfer
      ? receivedExpr
      : amountExpr;

  const setActiveExpr = (next: string) => {
    setValidationError(null);
    if (entryType === 'transfer' && activeTransferField === 'received' && isDiffCurrencyTransfer) {
      setReceivedExpr(next);
    } else {
      setAmountExpr(next);
    }
  };

  const sentCurrency = entryType === 'transfer' ? (fromWallet?.currency ?? 'VND') : (selectedWallet?.currency ?? 'VND');
  const receivedCurrency = toWallet?.currency ?? 'VND';
  const sentMinor = evaluateAmountExpression(amountExpr, sentCurrency);
  const receivedMinor = evaluateAmountExpression(receivedExpr, receivedCurrency);

  const handleTypeChange = (next: FormEntryType) => {
    if (isEdit) {
      const wasTransfer = entryType === 'transfer';
      const nextIsTransfer = next === 'transfer';
      if (wasTransfer !== nextIsTransfer) return;
    }
    setEntryType(next);
    setValidationError(null);
    if (next !== 'transfer') {
      setActiveTransferField('sent');
      setCategoryId(null);
    }
    if (!excludeTouched) {
      setExcludeFromReports(next === 'transfer');
    }
  };

  const isSaving = createEntry.isPending || updateEntry.isPending;

  const handleSave = async (doneMinor: number) => {
    if (isSaving) return;
    setValidationError(null);

    let input: EntryInput;
    let lastUsedWalletId: string;

    if (entryType === 'transfer') {
      if (!fromWallet || !toWallet || fromWallet.id === toWallet.id) {
        setValidationError(ownError(t('personalEntry.differentWalletsError')));
        return;
      }
      const sent = activeTransferField === 'sent' ? doneMinor : sentMinor;
      if (sent === null || sent <= 0) {
        setActiveTransferField('sent');
        return;
      }
      let received: number | undefined;
      if (isDiffCurrencyTransfer) {
        const rec = activeTransferField === 'received' ? doneMinor : receivedMinor;
        if (rec === null || rec <= 0) {
          setActiveTransferField('received');
          setValidationError(ownError(t('personalEntry.amountReceivedError')));
          return;
        }
        received = rec;
      }
      input = {
        type: 'transfer',
        fromWalletId: fromWallet.id,
        toWalletId: toWallet.id,
        amountSent: sent,
        ...(received !== undefined ? { amountReceived: received } : {}),
        date,
        time: time.trim() ? time.trim() : null,
        note: note.trim() ? note.trim() : null,
        tags,
        excludeFromReports,
      };
      lastUsedWalletId = fromWallet.id;
    } else {
      if (!selectedWallet) return;
      if (!categoryId) {
        setValidationError(ownError(t('personalEntry.pickCategoryError')));
        return;
      }
      input = {
        type: entryType,
        walletId: selectedWallet.id,
        amount: doneMinor,
        categoryId,
        date,
        time: time.trim() ? time.trim() : null,
        note: note.trim() ? note.trim() : null,
        tags,
        excludeFromReports,
      };
      lastUsedWalletId = selectedWallet.id;
    }

    try {
      if (isEdit && id) {
        await updateEntry.mutateAsync({ id, input });
      } else {
        await createEntry.mutateAsync(input);
      }
      writeLastWallet(lastUsedWalletId);
      showUndo({
        message: t('personalEntry.saved'),
        actionLabel: t('common.close'),
        onAction: () => {},
      });
      goBack();
    } catch (err) {
      setValidationError(err);
    }
  };

  const editLockedTransfer = isEdit && entryType === 'transfer';
  const editLockedNonTransfer = isEdit && entryType !== 'transfer';

  const impliedRate =
    isDiffCurrencyTransfer && fromWallet && toWallet && sentMinor !== null && receivedMinor !== null
      ? formatImpliedRate(fromWallet.currency, toWallet.currency, sentMinor, receivedMinor)
      : '';

  const renderAmountValue = (expr: string, cur: CurrencyCode, evaluated: number | null, tone: 'neutral' | 'success' | 'danger') => {
    if (evaluated !== null) {
      return <Amount value={evaluated} currency={cur} size="xl" tone={tone} />;
    }
    return (
      <span className="text-2xl font-bold tabular-nums text-muted-foreground">
        {expr || formatMoney(0, cur)}
      </span>
    );
  };

  const displayTone =
    entryType === 'expense' ? 'danger' : entryType === 'income' ? 'success' : 'neutral';

  const handleWalletPick = (pickedId: string) => {
    if (walletSheetTarget === 'single') {
      setWalletId(pickedId);
    } else if (walletSheetTarget === 'from') {
      if (pickedId === toWallet?.id) {
        setToWalletId(fromWallet?.id ?? '');
      }
      setFromWalletId(pickedId);
    } else if (walletSheetTarget === 'to') {
      if (pickedId === fromWallet?.id) {
        setFromWalletId(toWallet?.id ?? '');
      }
      setToWalletId(pickedId);
    }
    setWalletSheetTarget(null);
  };

  const isLoading = walletsQuery.isPending || (isEdit && !entry && listQuery.isPending);

  return (
    <div className="fsl-entry-page min-h-screen min-h-dvh bg-background flex flex-col">
      <header className="sticky top-0 h-14 bg-background border-b border-border z-20">
        <div className="h-full flex items-center gap-2 px-4 mx-auto w-full max-w-[480px]">
          <button
            type="button"
            onClick={goBack}
            aria-label={t('common.back')}
            title={t('common.back')}
            data-testid="entry-back"
            className="inline-flex items-center justify-center size-11 text-foreground rounded-full bg-transparent hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0 cursor-pointer border-0"
          >
            <Icon name="back" size={24} />
          </button>

          <Tabs
            value={entryType}
            onValueChange={(v) => handleTypeChange(v as FormEntryType)}
            className="flex-1 min-w-0 gap-0"
          >
            <TabsList
              aria-label={t('personalEntry.tabs')}
              className="flex bg-muted rounded-full p-1 gap-1 h-auto w-full"
            >
              <TabsTrigger
                value="expense"
                disabled={editLockedTransfer}
                data-testid="entry-tab-expense"
                className="flex-1 min-w-0 min-h-10 rounded-full px-2 text-sm font-medium text-muted-foreground data-active:bg-card data-active:text-foreground data-active:shadow-sm data-active:font-semibold"
              >
                {t('personalEntry.expense')}
              </TabsTrigger>
              <TabsTrigger
                value="income"
                disabled={editLockedTransfer}
                data-testid="entry-tab-income"
                className="flex-1 min-w-0 min-h-10 rounded-full px-2 text-sm font-medium text-muted-foreground data-active:bg-card data-active:text-foreground data-active:shadow-sm data-active:font-semibold"
              >
                {t('personalEntry.income')}
              </TabsTrigger>
              <TabsTrigger
                value="transfer"
                disabled={editLockedNonTransfer || (!isEdit && activeWallets.length < 2)}
                data-testid="entry-tab-transfer"
                className="flex-1 min-w-0 min-h-10 rounded-full px-2 text-sm font-medium text-muted-foreground data-active:bg-card data-active:text-foreground data-active:shadow-sm data-active:font-semibold"
              >
                {t('personalEntry.transfer')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-[480px] px-4 py-4 flex flex-col gap-4">
        {isLoading ? (
          <SkeletonList rows={4} />
        ) : walletsQuery.isError ? (
          <InlineError error={walletsQuery.error} onRetry={() => walletsQuery.refetch()} />
        ) : isEdit && !entry && listQuery.isError ? (
          <InlineError error={listQuery.error} onRetry={() => listQuery.refetch()} />
        ) : isEdit && !entry ? (
          <EmptyState icon="receipt" title={t('personalEntry.notFound')} />
        ) : (
          <>
            {validationError !== null && (
              <InlineError error={validationError} />
            )}

            {/* Display amount */}
            <div className="flex flex-col gap-2">
              {entryType === 'transfer' ? (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    data-testid="amount-sent-box"
                    onClick={() => setActiveTransferField('sent')}
                    className={cn(
                      'w-full rounded-xl bg-card border border-border px-4 py-3 flex items-center justify-between text-left cursor-pointer',
                      activeTransferField === 'sent' && 'ring-2 ring-primary',
                    )}
                  >
                    <span className="text-sm font-medium text-muted-foreground">
                      {t('personalEntry.amountSent')}
                    </span>
                    <div className="flex flex-col items-end">
                      {/[+\-\u2212]/.test(amountExpr) && (
                        <span className="text-xs text-muted-foreground tabular-nums">{amountExpr}</span>
                      )}
                      {renderAmountValue(amountExpr, sentCurrency, sentMinor, 'neutral')}
                    </div>
                  </button>

                  {isDiffCurrencyTransfer && (
                    <button
                      type="button"
                      data-testid="amount-received-box"
                      onClick={() => setActiveTransferField('received')}
                      className={cn(
                        'w-full rounded-xl bg-card border border-border px-4 py-3 flex items-center justify-between text-left cursor-pointer',
                        activeTransferField === 'received' && 'ring-2 ring-primary',
                      )}
                    >
                      <span className="text-sm font-medium text-muted-foreground">
                        {t('personalEntry.amountReceived')}
                      </span>
                      <div className="flex flex-col items-end">
                        {/[+\-\u2212]/.test(receivedExpr) && (
                          <span className="text-xs text-muted-foreground tabular-nums">{receivedExpr}</span>
                        )}
                        {renderAmountValue(receivedExpr, receivedCurrency, receivedMinor, 'neutral')}
                      </div>
                    </button>
                  )}

                  {impliedRate && (
                    <p
                      data-testid="transfer-implied-rate"
                      className="m-0 px-1 text-xs text-muted-foreground tabular-nums"
                    >
                      {impliedRate}
                    </p>
                  )}
                </div>
              ) : (
                <div
                  data-testid="amount-display"
                  className="rounded-xl bg-card border border-border px-4 py-3 flex flex-col items-end justify-center min-h-16"
                >
                  {/[+\-\u2212]/.test(amountExpr) && (
                    <span className="text-xs text-muted-foreground tabular-nums">{amountExpr}</span>
                  )}
                  <div className="flex items-center gap-1">
                    {sentMinor !== null && (
                      <span
                        className={cn(
                          'text-2xl font-bold',
                          entryType === 'expense' ? 'text-danger' : 'text-success',
                        )}
                      >
                        {entryType === 'expense' ? '−' : '+'}
                      </span>
                    )}
                    {renderAmountValue(amountExpr, sentCurrency, sentMinor, displayTone)}
                  </div>
                </div>
              )}
            </div>

            {/* Category tiles for expense/income */}
            {entryType !== 'transfer' && (
              <CategoryPicker
                type={entryType}
                categories={categoriesQuery.data?.categories ?? []}
                recentIds={categoriesQuery.data?.recentIds ?? []}
                value={categoryId}
                onChange={(cid) => {
                  setCategoryId(cid);
                  setValidationError(null);
                }}
              />
            )}

            {/* Compact rows */}
            <div className="rounded-xl bg-card border border-border divide-y divide-border overflow-hidden">
              {entryType === 'transfer' ? (
                <>
                  <button
                    type="button"
                    data-testid="entry-from-wallet-row"
                    onClick={() => setWalletSheetTarget('from')}
                    className="w-full min-h-11 px-4 py-2.5 flex items-center justify-between gap-3 bg-transparent border-0 text-left cursor-pointer hover:bg-muted/50"
                  >
                    <span className="text-sm font-medium text-muted-foreground">
                      {t('personalEntry.fromWallet')}
                    </span>
                    <span className="flex items-center gap-1 text-base font-medium text-foreground">
                      <span>{fromWallet ? `${fromWallet.name} (${fromWallet.currency})` : '—'}</span>
                      <Icon name="chevronRight" size={18} className="text-muted-foreground" />
                    </span>
                  </button>

                  <button
                    type="button"
                    data-testid="entry-to-wallet-row"
                    onClick={() => setWalletSheetTarget('to')}
                    className="w-full min-h-11 px-4 py-2.5 flex items-center justify-between gap-3 bg-transparent border-0 text-left cursor-pointer hover:bg-muted/50"
                  >
                    <span className="text-sm font-medium text-muted-foreground">
                      {t('personalEntry.toWallet')}
                    </span>
                    <span className="flex items-center gap-1 text-base font-medium text-foreground">
                      <span>{toWallet ? `${toWallet.name} (${toWallet.currency})` : '—'}</span>
                      <Icon name="chevronRight" size={18} className="text-muted-foreground" />
                    </span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  data-testid="entry-wallet-row"
                  onClick={() => setWalletSheetTarget('single')}
                  className="w-full min-h-11 px-4 py-2.5 flex items-center justify-between gap-3 bg-transparent border-0 text-left cursor-pointer hover:bg-muted/50"
                >
                  <span className="text-sm font-medium text-muted-foreground">
                    {t('personalEntry.wallet')}
                  </span>
                  <span className="flex items-center gap-1 text-base font-medium text-foreground">
                    <span>{selectedWallet ? `${selectedWallet.name} (${selectedWallet.currency})` : '—'}</span>
                    <Icon name="chevronRight" size={18} className="text-muted-foreground" />
                  </span>
                </button>
              )}

              <div className="w-full min-h-11 px-4 py-2 flex items-center justify-between gap-3">
                <Label htmlFor="entry-date-input" className="text-sm font-medium text-muted-foreground shrink-0">
                  {t('personalEntry.date')}
                </Label>
                <Input
                  id="entry-date-input"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  data-testid="entry-date-input"
                  className="text-base text-foreground bg-transparent border-0 shadow-none text-right px-0 focus-visible:ring-0 min-h-11 w-auto"
                />
              </div>

              <div className="w-full min-h-11 px-4 py-2 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-muted-foreground shrink-0">
                  {t('personalEntry.note')}
                </span>
                <Input
                  type="text"
                  maxLength={200}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('personalEntry.notePlaceholder')}
                  data-testid="entry-note-input"
                  className="text-base border-0 shadow-none text-right px-0 focus-visible:ring-0 min-h-11"
                />
              </div>
            </div>

            {/* More details toggle */}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                data-testid="entry-more-details-toggle"
                onClick={() => setShowMore((prev) => !prev)}
                className="min-h-11 px-1 flex items-center justify-between text-sm font-medium text-primary bg-transparent border-0 cursor-pointer"
              >
                <span>{t('personalEntry.moreDetails')}</span>
                <Icon name={showMore ? 'chevronUp' : 'chevronDown'} size={18} />
              </button>

              {showMore && (
                <div className="rounded-xl bg-card border border-border divide-y divide-border overflow-hidden">
                  <div className="w-full min-h-11 px-4 py-2 flex items-center justify-between gap-3">
                    <Label htmlFor="entry-time-input" className="text-sm font-medium text-muted-foreground shrink-0">
                      {t('personalEntry.time')}
                    </Label>
                    <Input
                      id="entry-time-input"
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      data-testid="entry-time-input"
                      className="text-base text-foreground bg-transparent border-0 shadow-none text-right px-0 focus-visible:ring-0 min-h-11 w-auto"
                    />
                  </div>

                  <div className="w-full px-4 py-3 flex flex-col gap-2">
                    <span className="text-sm font-medium text-muted-foreground">
                      {t('personalEntry.tags')}
                    </span>
                    <TagInput value={tags} onChange={setTags} />
                  </div>

                  <div className="w-full min-h-11 px-4 py-2.5 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-foreground">
                      {t('personalEntry.excludeFromReports')}
                    </span>
                    <Switch
                      checked={excludeFromReports}
                      onCheckedChange={(checked) => {
                        setExcludeFromReports(checked);
                        setExcludeTouched(true);
                      }}
                      aria-label={t('personalEntry.excludeFromReports')}
                      data-testid="entry-exclude-switch"
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Docked keypad at the bottom */}
      {!isLoading && !walletsQuery.isError && !(isEdit && !entry) && (
        <div className="sticky bottom-0 z-10 bg-background border-t border-border px-4 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
          <div className="mx-auto w-full max-w-[480px]">
            <fieldset disabled={isSaving} className="border-0 p-0 m-0 min-w-0">
              <AmountKeypad
                value={activeExpr}
                currency={activeCurrency}
                onChange={setActiveExpr}
                onDone={(minor) => void handleSave(minor)}
                doneLabel={t('personalEntry.save')}
                deleteLabel={t('personalEntry.deleteDigit')}
              />
            </fieldset>
          </div>
        </div>
      )}

      {/* Wallet picker Sheet */}
      <Sheet
        open={walletSheetTarget !== null}
        onClose={() => setWalletSheetTarget(null)}
        title={t('personalEntry.pickWallet')}
      >
        <div data-testid="wallet-picker-list" className="flex flex-col divide-y divide-border">
          {activeWallets.map((w) => {
            const currentId =
              walletSheetTarget === 'from'
                ? fromWallet?.id
                : walletSheetTarget === 'to'
                  ? toWallet?.id
                  : selectedWallet?.id;
            const isSelected = w.id === currentId;
            return (
              <button
                key={w.id}
                type="button"
                data-testid={`wallet-option-${w.id}`}
                onClick={() => handleWalletPick(w.id)}
                className="min-h-11 px-2 py-2.5 flex items-center justify-between gap-3 bg-transparent border-0 text-left cursor-pointer hover:bg-muted rounded-xl"
              >
                <div className="flex flex-col">
                  <span className="text-base font-medium text-foreground">{w.name}</span>
                  <span className="text-xs text-muted-foreground">{w.currency}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Amount value={w.balance} currency={w.currency} size="sm" tone="neutral" />
                  {isSelected && <Icon name="check" size={18} className="text-primary" />}
                </div>
              </button>
            );
          })}
        </div>
      </Sheet>
    </div>
  );
}
