import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import type {
  AssetView,
  CategoryView,
  ListQuery,
  TagView,
  WalletDetailView,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';
import { Pill } from '@cc/web-ui/components/Pill';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Label } from '@cc/web-ui/components/ui/label';
import { Switch } from '@cc/web-ui/components/ui/switch';
import { cn } from '@cc/web-ui/lib/utils';
import { FilterPickView } from './transactions/FilterPickView';

export type TransactionFilterValues = Omit<ListQuery, 'month' | 'recent'>;

export interface GroupFilterOption {
  id: string;
  name: string;
}

export interface TransactionFiltersProps {
  open: boolean;
  onClose(): void;
  value: TransactionFilterValues;
  onApply(next: TransactionFilterValues): void;
  wallets: WalletDetailView[];
  categories: CategoryView[];
  assets?: AssetView[];
  tags: TagView[];
  groups?: GroupFilterOption[];
}

type PickKind = 'wallet' | 'category' | 'asset' | 'tag' | 'trip';

const CHIP_CLASS =
  'min-h-11 px-3.5 py-2 rounded-full text-sm font-medium border transition-colors motion-reduce:transition-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const CHIP_ACTIVE = 'bg-primary text-primary-foreground border-primary';
const CHIP_IDLE = 'bg-card text-foreground border-border hover:bg-muted';

const PICK_ROW_CLASS =
  'flex w-full min-h-11 items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none cursor-pointer';

/** Orders visible categories so each parent is immediately followed by its sub-categories. */
function orderCategories(categories: CategoryView[]): CategoryView[] {
  const byId = new Set(categories.map((c) => c.id));
  const childrenByParent = new Map<string, CategoryView[]>();
  const roots: CategoryView[] = [];

  for (const cat of categories) {
    if (cat.parentId && byId.has(cat.parentId)) {
      const list = childrenByParent.get(cat.parentId) ?? [];
      list.push(cat);
      childrenByParent.set(cat.parentId, list);
    } else {
      roots.push(cat);
    }
  }

  const ordered: CategoryView[] = [];
  for (const root of roots) {
    ordered.push(root);
    const children = childrenByParent.get(root.id);
    if (children) ordered.push(...children);
  }
  return ordered;
}

export function TransactionFilters({
  open,
  onClose,
  value,
  onApply,
  wallets,
  categories,
  assets = [],
  tags,
  groups = [],
}: TransactionFiltersProps): JSX.Element {
  const t = useT();
  const [draft, setDraft] = useState<TransactionFilterValues>(value);
  const [pick, setPick] = useState<PickKind | null>(null);
  const rowRefs = useRef<Partial<Record<PickKind, HTMLButtonElement | null>>>({});
  const prevPickRef = useRef<PickKind | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(value);
      setPick(null);
      prevPickRef.current = null;
    }
  }, [open, value]);

  useEffect(() => {
    if (open && prevPickRef.current && pick === null) {
      rowRefs.current[prevPickRef.current]?.focus();
    }
    prevPickRef.current = pick;
  }, [open, pick]);

  const activeWallets = useMemo(() => wallets.filter((w) => !w.archived), [wallets]);
  const visibleCategories = useMemo(
    () => orderCategories(categories.filter((c) => !c.hidden)),
    [categories],
  );
  const tagItems = useMemo(
    () => tags.map((tag) => ({ id: tag.id, name: `#${tag.name}` })),
    [tags],
  );

  const handleReset = () => {
    setDraft((prev) => ({
      q: prev.q,
      from: prev.from,
      to: prev.to,
    }));
  };

  const handleApply = () => {
    const cleaned: TransactionFilterValues = {};
    if (value.q?.trim()) cleaned.q = value.q.trim();
    if (draft.type) cleaned.type = draft.type;
    if (draft.walletId) cleaned.walletId = draft.walletId;
    if (draft.categoryId) cleaned.categoryId = draft.categoryId;
    if (draft.assetId) cleaned.assetId = draft.assetId;
    if (draft.tagId) cleaned.tagId = draft.tagId;
    if (draft.tripId) cleaned.tripId = draft.tripId;
    if (draft.groups === 'hide') cleaned.groups = 'hide';
    if (value.from) cleaned.from = value.from;
    if (value.to) cleaned.to = value.to;
    onApply(cleaned);
    onClose();
  };

  const walletLabel = draft.walletId
    ? (wallets.find((w) => w.id === draft.walletId)?.name ?? draft.walletId)
    : t('transactions.allWallets');
  const categoryLabel = draft.categoryId
    ? (categories.find((c) => c.id === draft.categoryId)?.name ?? draft.categoryId)
    : t('transactions.allCategories');
  const assetLabel = draft.assetId
    ? (assets.find((a) => a.id === draft.assetId)?.name ?? draft.assetId)
    : t('transactions.allAssets');
  const tagLabel = draft.tagId
    ? `#${tags.find((tg) => tg.id === draft.tagId)?.name ?? draft.tagId}`
    : t('transactions.allTags');
  const tripLabel = draft.tripId
    ? (groups.find((g) => g.id === draft.tripId)?.name ?? draft.tripId)
    : t('transactions.allLink');

  return (
    <Sheet open={open} onClose={onClose} title={t('transactions.filterTitle')}>
      {pick === 'wallet' && (
        <FilterPickView
          title={t('personalEntry.wallet')}
          allLabel={t('transactions.allWallets')}
          items={activeWallets}
          selectedId={draft.walletId}
          testIdPrefix="tx-filter-wallet"
          onPick={(id) => {
            setDraft((prev) => ({ ...prev, walletId: id }));
            setPick(null);
          }}
          onBack={() => setPick(null)}
        />
      )}

      {pick === 'category' && (
        <FilterPickView
          title={t('transactions.categoryLabel')}
          allLabel={t('transactions.allCategories')}
          items={visibleCategories}
          selectedId={draft.categoryId}
          indentOf={(c) => (c.parentId ? 1 : 0)}
          testIdPrefix="tx-filter-category"
          onPick={(id) => {
            setDraft((prev) => ({ ...prev, categoryId: id }));
            setPick(null);
          }}
          onBack={() => setPick(null)}
        />
      )}

      {pick === 'asset' && (
        <FilterPickView
          title={t('personalEntry.asset')}
          allLabel={t('transactions.allAssets')}
          items={assets}
          selectedId={draft.assetId}
          testIdPrefix="tx-filter-asset"
          onPick={(id) => {
            setDraft((prev) => ({ ...prev, assetId: id }));
            setPick(null);
          }}
          onBack={() => setPick(null)}
        />
      )}

      {pick === 'tag' && (
        <FilterPickView
          title={t('personalEntry.tags')}
          allLabel={t('transactions.allTags')}
          items={tagItems}
          selectedId={draft.tagId}
          testIdPrefix="tx-filter-tag"
          onPick={(id) => {
            setDraft((prev) => ({ ...prev, tagId: id }));
            setPick(null);
          }}
          onBack={() => setPick(null)}
        />
      )}

      {pick === 'trip' && (
        <FilterPickView
          title={t('filters.group')}
          allLabel={t('transactions.allLink')}
          items={groups}
          selectedId={draft.tripId}
          testIdPrefix="tx-filter-trip"
          onPick={(id) => {
            setDraft((prev) => ({ ...prev, tripId: id }));
            setPick(null);
          }}
          onBack={() => setPick(null)}
        />
      )}

      {pick === null && (
        <div className="fsl-tx-filters flex flex-col gap-5 pb-4">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">
              {t('personalEntry.tabs')}
            </span>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: undefined, label: t('transactions.typeAll') },
                  { key: 'expense', label: t('personalEntry.expense') },
                  { key: 'income', label: t('personalEntry.income') },
                  { key: 'transfer', label: t('personalEntry.transfer') },
                  { key: 'trade', label: t('transactions.typeTrade') },
                  { key: 'person', label: t('transactions.typePerson') },
                ] as const
              ).map((opt) => {
                const active = draft.type === opt.key;
                return (
                  <button
                    key={opt.key ?? 'all'}
                    type="button"
                    data-testid={`tx-filter-type-${opt.key ?? 'all'}`}
                    onClick={() => setDraft((prev) => ({ ...prev, type: opt.key }))}
                    className={cn(CHIP_CLASS, active ? CHIP_ACTIVE : CHIP_IDLE)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card divide-y divide-border">
              {activeWallets.length > 0 && (
                <button
                  ref={(el) => {
                    rowRefs.current.wallet = el;
                  }}
                  type="button"
                  data-testid="tx-filter-row-wallet"
                  onClick={() => setPick('wallet')}
                  className={PICK_ROW_CLASS}
                >
                  <span className="shrink-0 font-medium text-foreground">
                    {t('personalEntry.wallet')}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                    <span className="truncate">{walletLabel}</span>
                    <Icon name="chevronRight" size={16} className="shrink-0" />
                  </span>
                </button>
              )}

              {visibleCategories.length > 0 && (
                <button
                  ref={(el) => {
                    rowRefs.current.category = el;
                  }}
                  type="button"
                  data-testid="tx-filter-row-category"
                  onClick={() => setPick('category')}
                  className={PICK_ROW_CLASS}
                >
                  <span className="shrink-0 font-medium text-foreground">
                    {t('transactions.categoryLabel')}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                    <span className="truncate">{categoryLabel}</span>
                    <Icon name="chevronRight" size={16} className="shrink-0" />
                  </span>
                </button>
              )}

              {assets.length > 0 && (
                <button
                  ref={(el) => {
                    rowRefs.current.asset = el;
                  }}
                  type="button"
                  data-testid="tx-filter-row-asset"
                  onClick={() => setPick('asset')}
                  className={PICK_ROW_CLASS}
                >
                  <span className="shrink-0 font-medium text-foreground">
                    {t('personalEntry.asset')}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                    <span className="truncate">{assetLabel}</span>
                    <Icon name="chevronRight" size={16} className="shrink-0" />
                  </span>
                </button>
              )}

              {tags.length > 0 && (
                <button
                  ref={(el) => {
                    rowRefs.current.tag = el;
                  }}
                  type="button"
                  data-testid="tx-filter-row-tag"
                  onClick={() => setPick('tag')}
                  className={PICK_ROW_CLASS}
                >
                  <span className="shrink-0 font-medium text-foreground">
                    {t('personalEntry.tags')}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                    <span className="truncate">{tagLabel}</span>
                    <Icon name="chevronRight" size={16} className="shrink-0" />
                  </span>
                </button>
              )}

              {groups.length > 0 && (
                <button
                  ref={(el) => {
                    rowRefs.current.trip = el;
                  }}
                  type="button"
                  data-testid="tx-filter-row-trip"
                  onClick={() => setPick('trip')}
                  className={PICK_ROW_CLASS}
                >
                  <span className="shrink-0 font-medium text-foreground">
                    {t('filters.group')}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                    <span className="truncate">{tripLabel}</span>
                    <Icon name="chevronRight" size={16} className="shrink-0" />
                  </span>
                </button>
              )}

              <div className="flex w-full min-h-12 items-center justify-between gap-3 px-4 py-2">
                <Label
                  htmlFor="tx-filter-show-groups-switch"
                  className="flex-1 min-h-11 flex items-center text-sm font-medium text-foreground cursor-pointer"
                >
                  {t('filters.showGroupRows')}
                </Label>
                <Switch
                  id="tx-filter-show-groups-switch"
                  checked={draft.groups !== 'hide'}
                  onCheckedChange={(checked) =>
                    setDraft((prev) => ({
                      ...prev,
                      groups: checked ? undefined : 'hide',
                    }))
                  }
                  aria-label={t('filters.showGroupRows')}
                  data-testid="tx-filter-show-groups"
                />
              </div>
            </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleReset}
              data-testid="tx-filter-reset"
              className="flex-1"
            >
              {t('transactions.resetFilters')}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleApply}
              data-testid="tx-filter-apply"
              className="flex-1"
            >
              {t('transactions.applyFilters')}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

export interface ActiveFilterPillsProps {
  filters: TransactionFilterValues;
  wallets: WalletDetailView[];
  categories: CategoryView[];
  assets?: AssetView[];
  tags?: TagView[];
  groups?: GroupFilterOption[];
  hasAnyFilter: boolean;
  onRemove(key: keyof TransactionFilterValues): void;
  onClearAll(): void;
}

export function ActiveFilterPills({
  filters,
  wallets,
  categories,
  assets = [],
  groups = [],
  hasAnyFilter,
  onRemove,
  onClearAll,
}: ActiveFilterPillsProps): JSX.Element | null {
  const t = useT();
  const items: { key: keyof TransactionFilterValues; label: string }[] = [];

  if (filters.type) {
    const typeLabel =
      filters.type === 'expense'
        ? t('personalEntry.expense')
        : filters.type === 'income'
          ? t('personalEntry.income')
          : filters.type === 'transfer'
            ? t('personalEntry.transfer')
            : filters.type === 'trade'
              ? t('transactions.typeTrade')
              : t('transactions.typePerson');
    items.push({ key: 'type', label: typeLabel });
  }
  if (filters.walletId) {
    const w = wallets.find((x) => x.id === filters.walletId);
    items.push({ key: 'walletId', label: w?.name ?? filters.walletId });
  }
  if (filters.categoryId) {
    const c = categories.find((x) => x.id === filters.categoryId);
    items.push({ key: 'categoryId', label: c?.name ?? filters.categoryId });
  }
  if (filters.assetId) {
    const a = assets.find((x) => x.id === filters.assetId);
    items.push({ key: 'assetId', label: a?.name ?? filters.assetId });
  }
  if (filters.tripId) {
    const g = groups.find((x) => x.id === filters.tripId);
    items.push({
      key: 'tripId',
      label: `${t('filters.group')}: ${g?.name ?? filters.tripId}`,
    });
  }
  if (filters.groups === 'hide') {
    items.push({ key: 'groups', label: t('filters.showGroupRows') });
  }

  if (!hasAnyFilter && items.length === 0) return null;

  return (
    <div
      data-testid="tx-active-filters"
      className="fsl-tx-filters__pills flex flex-wrap items-center gap-2"
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onRemove(item.key)}
          aria-label={t('transactions.removeFilter', { label: item.label })}
          data-testid={`tx-filter-pill-${item.key}`}
          className="inline-flex min-h-11 items-center bg-transparent border-0 p-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
        >
          <Pill tone="accent" className="gap-1 pr-1.5 py-1 text-xs">
            <span className="max-w-48 truncate">{item.label}</span>
            <Icon name="x" size={12} />
          </Pill>
        </button>
      ))}
      {hasAnyFilter && (
        <Button
          type="button"
          variant="ghost"
          data-testid="tx-clear-all"
          onClick={onClearAll}
          className="text-xs text-muted-foreground px-3 motion-reduce:transition-none"
        >
          <Icon name="x" size={14} />
          <span>{t('transactions.clearAll')}</span>
        </Button>
      )}
    </div>
  );
}
