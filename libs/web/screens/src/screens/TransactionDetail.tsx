import { useEffect, useMemo, useState, type JSX } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  assetQuantityLabel,
  formatMoney,
  type AssetView,
  type CategoryView,
  type EntryInput,
  type EntryView,
  type ListResponse,
  type WalletDetailView,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import { currentMonthLocal } from '@cc/web-util/localDate';
import {
  PERSONAL_LIST_KEY,
  useAssets,
  useCategories,
  useDeleteEntry,
  usePersonalList,
  useRestoreEntries,
  useUpdateEntry,
  useWalletDetails,
} from '@cc/web-data-access/personalMoney';
import {
  useRecurringRules,
  useRuleFromTransaction,
} from '@cc/web-data-access/recurring';
import { Amount } from '@cc/web-ui/components/Amount';
import { Button } from '@cc/web-ui/components/Button';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { Icon } from '@cc/web-ui/components/icons';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Modal } from '@cc/web-ui/components/Modal';
import { Pill } from '@cc/web-ui/components/Pill';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { Label } from '@cc/web-ui/components/ui/label';
import { Switch } from '@cc/web-ui/components/ui/switch';
import { cn } from '@cc/web-ui/lib/utils';
import { CategoryPicker } from '../components/CategoryPicker';
import { formatEntryDayLabel } from '../components/EntryDateRow';
import { draftTitle } from '../components/PlannedItemCard';
import { Screen } from '../components/Screen';
import { TagInput } from '../components/TagInput';
import { resolveCategoryIcon } from '../components/TransactionRow';
import { formatFullCalendarDate } from '../components/transactions/rowHelpers';
import { showUndo } from '../components/UndoSnackbarHost';
import { useBack } from '../lib/navHistory';
import { scheduleInWords } from '../lib/scheduleWords';

export interface TransactionDetailContentProps {
  entry: EntryView;
  wallets: WalletDetailView[];
  categories: CategoryView[];
  assets?: AssetView[];
  onDone(): void;
}

type ExpandedEntryField = 'category' | 'wallet' | 'tags' | null;

const FIELD_ROW_CLASS =
  'flex w-full min-h-12 items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none cursor-pointer bg-transparent border-0';

export function TransactionDetailContent({
  entry,
  wallets,
  categories,
  assets = [],
  onDone,
}: TransactionDetailContentProps): JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const deleteEntry = useDeleteEntry();
  const restoreEntries = useRestoreEntries();
  const updateEntry = useUpdateEntry();
  const ruleFromTx = useRuleFromTransaction();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [expanded, setExpanded] = useState<ExpandedEntryField>(null);
  const [localCategoryId, setLocalCategoryId] = useState<string | null>(entry.categoryId);
  const [localWalletId, setLocalWalletId] = useState<string>(entry.walletId);
  const [localTags, setLocalTags] = useState<string[]>(entry.tags);
  const [localExclude, setLocalExclude] = useState<boolean>(entry.excludeFromReports);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [repeatError, setRepeatError] = useState<unknown>(null);

  const isRecurring = entry.source === 'recurring';
  const canRepeat =
    entry.source === 'manual' &&
    (entry.type === 'expense' ||
      entry.type === 'income' ||
      entry.type === 'buy' ||
      entry.type === 'transfer_in' ||
      entry.type === 'transfer_out');
  const rulesQuery = useRecurringRules({ enabled: isRecurring });

  useEffect(() => {
    setExpanded(null);
    setSaveError(null);
    setRepeatError(null);
    setLocalCategoryId(entry.categoryId);
    setLocalWalletId(entry.walletId);
    setLocalTags(entry.tags);
    setLocalExclude(entry.excludeFromReports);
  }, [entry.id, entry.categoryId, entry.walletId, entry.tags, entry.excludeFromReports]);

  const isTransfer = entry.type === 'transfer_in' || entry.type === 'transfer_out';
  const isTrade = entry.type === 'buy' || entry.type === 'sell';
  const isBuy = entry.type === 'buy';
  const isExpense = entry.type === 'expense';
  const isStandardEntry = entry.type === 'expense' || entry.type === 'income';
  const walletMap = new Map(wallets.map((w) => [w.id, w.name]));
  const category = localCategoryId
    ? categories.find((c) => c.id === localCategoryId)
    : undefined;
  const asset = entry.assetId ? assets.find((a) => a.id === entry.assetId) : undefined;
  const assetName = asset?.name ?? entry.assetId ?? '';

  const title = isTransfer
    ? t('personalEntry.transfer')
    : isTrade
      ? isBuy
        ? t('transactions.buyAssetTitle', { asset: assetName })
        : t('transactions.sellAssetTitle', { asset: assetName })
      : category?.name ??
        (isExpense ? t('personalEntry.expense') : t('personalEntry.income'));

  const formattedAmount = formatMoney(Math.abs(entry.amount), entry.currency);
  const signedText = isTransfer
    ? formattedAmount
    : isTrade
      ? isBuy
        ? `\u2212${formattedAmount}`
        : `+${formattedAmount}`
      : isExpense
        ? `\u2212${formattedAmount}`
        : `+${formattedAmount}`;

  const amountToneClass = isTransfer || isTrade
    ? 'text-foreground'
    : isExpense
      ? 'text-danger'
      : 'text-success';

  const walletName = walletMap.get(localWalletId) ?? localWalletId;
  const counterpartName = entry.counterpartWalletId
    ? walletMap.get(entry.counterpartWalletId) ?? entry.counterpartWalletId
    : '';

  const walletLine = isTransfer && counterpartName
    ? entry.type === 'transfer_out'
      ? `${walletName} \u2192 ${counterpartName}`
      : `${counterpartName} \u2192 ${walletName}`
    : walletName;

  const sameCurrencyWallets = useMemo(
    () => wallets.filter((w) => w.currency === entry.currency && !w.archived),
    [wallets, entry.currency],
  );

  const saveStandardPatch = (
    overrides: Partial<{
      categoryId: string | null;
      walletId: string;
      tags: string[];
      excludeFromReports: boolean;
    }>,
    onCollapsed?: () => void,
  ) => {
    if (!isStandardEntry) return;
    const nextCategoryId = overrides.categoryId !== undefined ? overrides.categoryId : localCategoryId;
    const nextWalletId = overrides.walletId !== undefined ? overrides.walletId : localWalletId;
    const nextTags = overrides.tags !== undefined ? overrides.tags : localTags;
    const nextExclude =
      overrides.excludeFromReports !== undefined ? overrides.excludeFromReports : localExclude;
    if (!nextCategoryId) return;

    const prev = {
      categoryId: localCategoryId,
      walletId: localWalletId,
      tags: localTags,
      exclude: localExclude,
    };
    setSaveError(null);
    setLocalCategoryId(nextCategoryId);
    setLocalWalletId(nextWalletId);
    setLocalTags(nextTags);
    setLocalExclude(nextExclude);

    const input: EntryInput = {
      type: entry.type === 'income' ? 'income' : 'expense',
      walletId: nextWalletId,
      amount: entry.amount,
      categoryId: nextCategoryId,
      date: entry.date,
      time: entry.time,
      note: entry.note,
      tags: nextTags,
      excludeFromReports: nextExclude,
    };

    updateEntry.mutate(
      { id: entry.id, input },
      {
        onSuccess: () => {
          onCollapsed?.();
        },
        onError: (err) => {
          setLocalCategoryId(prev.categoryId);
          setLocalWalletId(prev.walletId);
          setLocalTags(prev.tags);
          setLocalExclude(prev.exclude);
          setSaveError(err);
        },
      },
    );
  };

  const handleEdit = () => {
    onDone();
    navigate(`/entries/${encodeURIComponent(entry.id)}/edit`, {
      state: {
        entry: {
          ...entry,
          categoryId: localCategoryId,
          walletId: localWalletId,
          tags: localTags,
          excludeFromReports: localExclude,
        },
      },
    });
  };

  const handleDelete = () => {
    deleteEntry.mutate(entry.id, {
      onSuccess: (deleted) => {
        setConfirmOpen(false);
        onDone();
        showUndo(
          {
            message: t('transactions.deleted'),
            actionLabel: t('common.undo'),
            onAction: () => {
              restoreEntries.mutate(deleted);
            },
          },
          5000,
        );
      },
    });
  };

  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const assetsById = useMemo(
    () => new Map(assets.map((a) => [a.id, a])),
    [assets],
  );
  const matchedRule = useMemo(() => {
    if (!isRecurring || !entry.ruleId) return null;
    return rulesQuery.data?.rules.find((r) => r.id === entry.ruleId) ?? null;
  }, [isRecurring, entry.ruleId, rulesQuery.data?.rules]);

  const handleRepeatThis = async () => {
    setRepeatError(null);
    try {
      const res = await ruleFromTx.mutateAsync(entry.id);
      navigate(`/recurring/${encodeURIComponent(res.rule.id)}`);
    } catch (err) {
      setRepeatError(err);
    }
  };

  const dateLabel = formatEntryDayLabel(entry.date, t);
  const subtitleParts = [
    walletLine,
    entry.time ? `${dateLabel} · ${entry.time}` : dateLabel,
  ].filter(Boolean);

  return (
    <div className="fsl-tx-detail flex flex-col gap-3 pb-2">
      <p className="m-0 text-xs text-muted-foreground">
        {subtitleParts.join(' · ')}
      </p>

      <div className="rounded-xl bg-secondary px-3 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-foreground truncate">
            {entry.note || title}
          </span>
          {entry.beforeStart && (
            <Pill tone="neutral">{t('wallet.beforeStart')}</Pill>
          )}
        </div>
        <span
          data-testid="tx-detail-amount"
          className={cn(
            'text-sm font-semibold tabular-nums shrink-0',
            amountToneClass,
          )}
        >
          {signedText}
        </span>
      </div>

      {isStandardEntry ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card divide-y divide-border">
          <div>
            <button
              type="button"
              data-testid="entry-row-field-category"
              aria-expanded={expanded === 'category'}
              onClick={() =>
                setExpanded((curr) => (curr === 'category' ? null : 'category'))
              }
              className={FIELD_ROW_CLASS}
            >
              <span className="shrink-0 text-muted-foreground">
                {t('transactions.categoryLabel')}
              </span>
              <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
                {category && (
                  <Icon
                    name={resolveCategoryIcon(
                      category.icon,
                      isExpense ? 'expense' : 'income',
                    )}
                    size={16}
                    className="shrink-0 text-secondary-foreground"
                  />
                )}
                <span className="truncate">
                  {category?.name ?? t('transactions.otherCategory')}
                </span>
                <Icon
                  name="chevronRight"
                  size={16}
                  className="shrink-0 text-muted-foreground"
                />
              </span>
            </button>

            {expanded === 'category' && (
              <div className="border-t border-border px-3 py-3">
                <CategoryPicker
                  type={isExpense ? 'expense' : 'income'}
                  categories={categories}
                  recentIds={[]}
                  value={localCategoryId}
                  onChange={(cid) =>
                    saveStandardPatch({ categoryId: cid }, () => setExpanded(null))
                  }
                />
              </div>
            )}
          </div>

          <div>
            <button
              type="button"
              data-testid="entry-row-field-wallet"
              aria-expanded={expanded === 'wallet'}
              onClick={() =>
                setExpanded((curr) => (curr === 'wallet' ? null : 'wallet'))
              }
              className={FIELD_ROW_CLASS}
            >
              <span className="shrink-0 text-muted-foreground">
                {t('personalEntry.wallet')}
              </span>
              <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
                <span className="truncate">{walletName}</span>
                <Icon
                  name="chevronRight"
                  size={16}
                  className="shrink-0 text-muted-foreground"
                />
              </span>
            </button>

            {expanded === 'wallet' && (
              <div className="border-t border-border divide-y divide-border">
                {sameCurrencyWallets.map((w) => {
                  const selected = localWalletId === w.id;
                  return (
                    <button
                      key={w.id}
                      type="button"
                      aria-pressed={selected}
                      disabled={updateEntry.isPending}
                      onClick={() =>
                        saveStandardPatch({ walletId: w.id }, () => setExpanded(null))
                      }
                      className={cn(
                        'flex w-full min-h-11 items-center justify-between gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none cursor-pointer bg-transparent border-0',
                        selected ? 'font-semibold text-primary' : 'text-foreground',
                      )}
                    >
                      <span className="truncate">{w.name}</span>
                      {selected && (
                        <Icon name="check" size={16} className="shrink-0 text-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <button
              type="button"
              data-testid="entry-row-field-tags"
              aria-expanded={expanded === 'tags'}
              onClick={() =>
                setExpanded((curr) => (curr === 'tags' ? null : 'tags'))
              }
              className={FIELD_ROW_CLASS}
            >
              <span className="shrink-0 text-muted-foreground">
                {t('personalEntry.tags')}
              </span>
              <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
                <span className="truncate">
                  {localTags.length > 0
                    ? localTags.map((n) => `#${n}`).join(' ')
                    : ''}
                </span>
                <Icon
                  name="chevronRight"
                  size={16}
                  className="shrink-0 text-muted-foreground"
                />
              </span>
            </button>

            {expanded === 'tags' && (
              <div className="border-t border-border px-4 py-3">
                <TagInput
                  value={localTags}
                  onChange={(nextTags) => saveStandardPatch({ tags: nextTags })}
                />
              </div>
            )}
          </div>

          <div className="flex w-full min-h-12 items-center justify-between gap-3 px-4 py-2">
            <Label
              htmlFor="entry-row-exclude-switch"
              className="flex-1 min-h-11 flex items-center text-sm font-normal text-muted-foreground cursor-pointer"
            >
              {t('personalEntry.excludeFromReports')}
            </Label>
            <Switch
              id="entry-row-exclude-switch"
              checked={localExclude}
              disabled={updateEntry.isPending}
              onCheckedChange={(checked) =>
                saveStandardPatch({ excludeFromReports: checked })
              }
              aria-label={t('personalEntry.excludeFromReports')}
            />
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
          {isTrade && assetName && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="text-muted-foreground">{t('personalEntry.asset')}</span>
              <span data-testid="tx-detail-asset" className="font-medium text-foreground text-right">
                {assetName}
              </span>
            </div>
          )}

          {isTrade && entry.quantity != null && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="text-muted-foreground">{t('personalEntry.quantity')}</span>
              <span
                data-testid="tx-detail-quantity"
                className="font-medium text-foreground tabular-nums text-right"
              >
                {asset
                  ? assetQuantityLabel(entry.quantity, asset)
                  : String(entry.quantity)}
              </span>
            </div>
          )}

          {isTrade && asset && entry.quantity != null && entry.quantity > 0 && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                {t('transactions.pricePerUnit', { unit: asset.unit || asset.name })}
              </span>
              <span data-testid="tx-detail-unit-price" className="text-right">
                <Amount
                  value={Math.round((Math.abs(entry.amount) * 10 ** asset.decimals) / entry.quantity)}
                  currency={entry.currency}
                  tone="neutral"
                  size="sm"
                />
              </span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="text-muted-foreground">{t('personalEntry.wallet')}</span>
            <span className="font-medium text-foreground text-right">{walletLine}</span>
          </div>

          <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="text-muted-foreground">{t('personalEntry.date')}</span>
            <span className="font-medium text-foreground tabular-nums">
              {entry.time
                ? `${formatFullCalendarDate(entry.date)} · ${entry.time}`
                : formatFullCalendarDate(entry.date)}
            </span>
          </div>

          {entry.note && (
            <div className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
              <span className="text-muted-foreground shrink-0">
                {t('personalEntry.note')}
              </span>
              <span className="font-medium text-foreground text-right break-words">
                {entry.note}
              </span>
            </div>
          )}

          {entry.tags.length > 0 && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="text-muted-foreground shrink-0">
                {t('personalEntry.tags')}
              </span>
              <div className="flex flex-wrap justify-end gap-1.5">
                {entry.tags.map((tag) => (
                  <Pill key={tag} tone="accent" className="text-xs">
                    #{tag}
                  </Pill>
                ))}
              </div>
            </div>
          )}

          {entry.excludeFromReports && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                {t('personalEntry.excludeFromReports')}
              </span>
              <Icon name="check" size={16} className="text-foreground" />
            </div>
          )}
        </div>
      )}

      {isRecurring &&
        (matchedRule ? (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <Link
              to={`/recurring/${encodeURIComponent(matchedRule.id)}`}
              data-testid="tx-detail-rule"
              className="flex min-h-12 items-center gap-3 px-4 py-3 text-sm text-foreground no-underline hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors motion-reduce:transition-none"
            >
              <Icon name="repeat" size={18} className="shrink-0 text-secondary-foreground" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground truncate">
                  {t('recurring.autoRecordedBy', {
                    name: draftTitle(matchedRule.draft, categoriesById, assetsById, t),
                  })}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {scheduleInWords(matchedRule.schedule, t)}
                </div>
              </div>
              <Icon name="chevronRight" size={16} className="shrink-0 text-muted-foreground" />
            </Link>
          </div>
        ) : !rulesQuery.isPending || !entry.ruleId ? (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div
              data-testid="tx-detail-rule"
              className="flex min-h-12 items-center gap-3 px-4 py-3 text-sm"
            >
              <Icon name="repeat" size={18} className="shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground">{t('recurring.markLabel')}</div>
                <div className="text-xs text-muted-foreground">{t('recurring.ruleDeleted')}</div>
              </div>
            </div>
          </div>
        ) : null)}

      {canRepeat && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <button
            type="button"
            data-testid="tx-detail-repeat"
            disabled={ruleFromTx.isPending}
            onClick={() => void handleRepeatThis()}
            className="flex w-full min-h-12 items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-primary bg-transparent border-0 cursor-pointer hover:bg-accent disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors motion-reduce:transition-none"
          >
            <Icon name="repeat" size={18} className="shrink-0 text-primary" />
            <span className="flex-1">{t('recurring.repeatThis')}</span>
          </button>
        </div>
      )}

      {repeatError !== null && <InlineError error={repeatError} />}
      {saveError !== null && <InlineError error={saveError} />}
      {deleteEntry.error && <InlineError error={deleteEntry.error} />}

      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          variant="secondary"
          data-testid="tx-detail-edit"
          onClick={handleEdit}
          className="flex-1"
        >
          {t('transactions.edit')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          data-testid="tx-detail-delete"
          onClick={() => setConfirmOpen(true)}
          className="flex-1 text-danger hover:text-danger hover:bg-danger-soft"
        >
          {t('transactions.delete')}
        </Button>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('transactions.deleteConfirmTitle')}
      >
        <div className="flex flex-col gap-4">
          <p className="m-0 text-sm text-muted-foreground">
            {isTransfer
              ? t('transactions.deleteTransferBody')
              : t('transactions.deleteConfirmBody')}
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="danger"
              data-testid="tx-delete-confirm"
              loading={deleteEntry.isPending}
              onClick={handleDelete}
            >
              {t('transactions.delete')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function TransactionDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const t = useT();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { goBack } = useBack('/transactions');

  const stateEntry = (location.state as { entry?: EntryView } | null)?.entry;

  const cachedFromCache = (() => {
    if (!id) return null;
    const cachedLists = queryClient.getQueriesData<ListResponse>({
      queryKey: PERSONAL_LIST_KEY,
    });
    for (const [, data] of cachedLists) {
      if (!data) continue;
      for (const row of data.rows) {
        if (row.kind === 'entry' && row.entry.id === id) {
          return row.entry;
        }
      }
    }
    return null;
  })();

  const targetMonth =
    cachedFromCache?.date.slice(0, 7) ?? stateEntry?.date.slice(0, 7) ?? currentMonthLocal();
  const listQuery = usePersonalList(
    { month: targetMonth },
    { enabled: Boolean(id) && !cachedFromCache },
  );

  const entry = useMemo(() => {
    if (cachedFromCache) return cachedFromCache;
    if (id && listQuery.data) {
      for (const row of listQuery.data.rows) {
        if (row.kind === 'entry' && row.entry.id === id) {
          return row.entry;
        }
      }
    }
    return stateEntry ?? null;
  }, [cachedFromCache, id, listQuery.data, stateEntry]);

  const walletsQuery = useWalletDetails();
  const categoriesQuery = useCategories();
  const isTradeEntry = entry?.type === 'buy' || entry?.type === 'sell';
  const assetsQuery = useAssets({ enabled: isTradeEntry });

  return (
    <Screen title={t('transactions.detailTitle')} back="/transactions">
      <div className="py-4">
        {(!entry && listQuery.isPending) || (isTradeEntry && assetsQuery.isPending) ? (
          <SkeletonList rows={4} />
        ) : !entry && listQuery.error ? (
          <InlineError error={listQuery.error} onRetry={() => listQuery.refetch()} />
        ) : !entry ? (
          <EmptyState
            icon="receipt"
            title={t('personalEntry.notFound')}
            action={
              <Button variant="primary" onClick={goBack}>
                {t('common.back')}
              </Button>
            }
          />
        ) : (
          <TransactionDetailContent
            entry={entry}
            wallets={walletsQuery.data?.wallets ?? []}
            categories={categoriesQuery.data?.categories ?? []}
            assets={assetsQuery.data?.assets ?? []}
            onDone={goBack}
          />
        )}
      </div>
    </Screen>
  );
}
