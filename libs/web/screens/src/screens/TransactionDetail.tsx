import { useMemo, useState, type JSX } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  formatMoney,
  formatQuantity,
  type AssetView,
  type CategoryView,
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
  useWalletDetails,
} from '@cc/web-data-access/personalMoney';
import { Amount } from '@cc/web-ui/components/Amount';
import { Button } from '@cc/web-ui/components/Button';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { Icon, type IconName } from '@cc/web-ui/components/icons';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Modal } from '@cc/web-ui/components/Modal';
import { Pill } from '@cc/web-ui/components/Pill';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { cn } from '@cc/web-ui/lib/utils';
import { Screen } from '../components/Screen';
import { resolveCategoryIcon } from '../components/TransactionRow';
import { showUndo } from '../components/UndoSnackbarHost';
import { useBack } from '../lib/navHistory';

export interface TransactionDetailContentProps {
  entry: EntryView;
  wallets: WalletDetailView[];
  categories: CategoryView[];
  assets?: AssetView[];
  onDone(): void;
}

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
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isTransfer = entry.type === 'transfer_in' || entry.type === 'transfer_out';
  const isTrade = entry.type === 'buy' || entry.type === 'sell';
  const isBuy = entry.type === 'buy';
  const isExpense = entry.type === 'expense';
  const walletMap = new Map(wallets.map((w) => [w.id, w.name]));
  const category = entry.categoryId
    ? categories.find((c) => c.id === entry.categoryId)
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

  const iconName: IconName = isTransfer
    ? 'swap'
    : isTrade
      ? 'trending-up'
      : resolveCategoryIcon(category?.icon, isExpense ? 'expense' : 'income');

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

  const walletName = walletMap.get(entry.walletId) ?? entry.walletId;
  const counterpartName = entry.counterpartWalletId
    ? walletMap.get(entry.counterpartWalletId) ?? entry.counterpartWalletId
    : '';

  const walletLine = isTransfer && counterpartName
    ? entry.type === 'transfer_out'
      ? `${walletName} \u2192 ${counterpartName}`
      : `${counterpartName} \u2192 ${walletName}`
    : walletName;

  const handleEdit = () => {
    navigate(`/entries/${encodeURIComponent(entry.id)}/edit`, {
      state: { entry },
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

  return (
    <div className="fsl-tx-detail flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 py-3 text-center">
        <span
          aria-hidden="true"
          className="size-12 rounded-2xl bg-secondary text-secondary-foreground grid place-items-center"
        >
          <Icon name={iconName} size={22} />
        </span>
        <p className="m-0 text-sm font-medium text-muted-foreground">{title}</p>
        <p
          data-testid="tx-detail-amount"
          className={cn(
            'm-0 text-3xl font-bold tabular-nums tracking-tight',
            amountToneClass,
          )}
        >
          {signedText}
        </p>
        {entry.beforeStart && (
          <Pill tone="neutral">{t('wallet.beforeStart')}</Pill>
        )}
      </div>

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
                ? `${formatQuantity(entry.quantity, asset.decimals)} ${asset.unit}`
                : String(entry.quantity)}
            </span>
          </div>
        )}

        {isTrade && asset && entry.quantity != null && entry.quantity > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              {t('transactions.pricePerUnit', { unit: asset.unit })}
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
            {entry.time ? `${entry.date} · ${entry.time}` : entry.date}
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
