import { useEffect, useState, type JSX } from 'react';
import type {
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
import { Input } from '@cc/web-ui/components/ui/input';
import { Label } from '@cc/web-ui/components/ui/label';
import { cn } from '@cc/web-ui/lib/utils';

export type TransactionFilterValues = Omit<ListQuery, 'month'>;

export interface TransactionFiltersProps {
  open: boolean;
  onClose(): void;
  value: TransactionFilterValues;
  onApply(next: TransactionFilterValues): void;
  wallets: WalletDetailView[];
  categories: CategoryView[];
  tags: TagView[];
}

const CHIP_CLASS =
  'min-h-9 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors cursor-pointer';
const CHIP_ACTIVE = 'bg-primary text-primary-foreground border-primary';
const CHIP_IDLE = 'bg-card text-foreground border-border hover:bg-muted';

export function TransactionFilters({
  open,
  onClose,
  value,
  onApply,
  wallets,
  categories,
  tags,
}: TransactionFiltersProps): JSX.Element {
  const t = useT();
  const [draft, setDraft] = useState<TransactionFilterValues>(value);

  useEffect(() => {
    if (open) {
      setDraft(value);
    }
  }, [open, value]);

  const activeWallets = wallets.filter((w) => !w.archived);
  const visibleCategories = categories.filter((c) => !c.hidden);

  const handleReset = () => {
    setDraft({});
  };

  const handleApply = () => {
    const cleaned: TransactionFilterValues = {};
    if (draft.q?.trim()) cleaned.q = draft.q.trim();
    if (draft.type) cleaned.type = draft.type;
    if (draft.walletId) cleaned.walletId = draft.walletId;
    if (draft.categoryId) cleaned.categoryId = draft.categoryId;
    if (draft.tagId) cleaned.tagId = draft.tagId;
    if (draft.from) cleaned.from = draft.from;
    if (draft.to) cleaned.to = draft.to;
    onApply(cleaned);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('transactions.filterTitle')}>
      <div className="fsl-tx-filters flex flex-col gap-5 pb-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tx-filter-search">{t('transactions.searchLabel')}</Label>
          <Input
            id="tx-filter-search"
            data-testid="tx-filter-search"
            type="search"
            value={draft.q ?? ''}
            onChange={(e) => setDraft((prev) => ({ ...prev, q: e.target.value }))}
            placeholder={t('transactions.searchPlaceholder')}
            className="text-base min-h-11"
          />
        </div>

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

        {activeWallets.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">
              {t('personalEntry.wallet')}
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, walletId: undefined }))}
                className={cn(CHIP_CLASS, !draft.walletId ? CHIP_ACTIVE : CHIP_IDLE)}
              >
                {t('transactions.allWallets')}
              </button>
              {activeWallets.map((w) => {
                const active = draft.walletId === w.id;
                return (
                  <button
                    key={w.id}
                    type="button"
                    data-testid={`tx-filter-wallet-${w.id}`}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        walletId: active ? undefined : w.id,
                      }))
                    }
                    className={cn(CHIP_CLASS, active ? CHIP_ACTIVE : CHIP_IDLE)}
                  >
                    {w.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {visibleCategories.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">
              {t('personalEntry.pickCategory')}
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, categoryId: undefined }))}
                className={cn(CHIP_CLASS, !draft.categoryId ? CHIP_ACTIVE : CHIP_IDLE)}
              >
                {t('transactions.allCategories')}
              </button>
              {visibleCategories.map((c) => {
                const active = draft.categoryId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    data-testid={`tx-filter-category-${c.id}`}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        categoryId: active ? undefined : c.id,
                      }))
                    }
                    className={cn(CHIP_CLASS, active ? CHIP_ACTIVE : CHIP_IDLE)}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tags.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">
              {t('personalEntry.tags')}
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, tagId: undefined }))}
                className={cn(CHIP_CLASS, !draft.tagId ? CHIP_ACTIVE : CHIP_IDLE)}
              >
                {t('transactions.allTags')}
              </button>
              {tags.map((tag) => {
                const active = draft.tagId === tag.id;
                return (
                  <button
                    key={tag.id}
                    type="button"
                    data-testid={`tx-filter-tag-${tag.id}`}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        tagId: active ? undefined : tag.id,
                      }))
                    }
                    className={cn(CHIP_CLASS, active ? CHIP_ACTIVE : CHIP_IDLE)}
                  >
                    #{tag.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tx-filter-from">{t('transactions.fromDate')}</Label>
            <Input
              id="tx-filter-from"
              type="date"
              value={draft.from ?? ''}
              onChange={(e) => setDraft((prev) => ({ ...prev, from: e.target.value || undefined }))}
              className="text-base min-h-11"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tx-filter-to">{t('transactions.toDate')}</Label>
            <Input
              id="tx-filter-to"
              type="date"
              value={draft.to ?? ''}
              onChange={(e) => setDraft((prev) => ({ ...prev, to: e.target.value || undefined }))}
              className="text-base min-h-11"
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
    </Sheet>
  );
}

export interface ActiveFilterPillsProps {
  filters: TransactionFilterValues;
  wallets: WalletDetailView[];
  categories: CategoryView[];
  tags: TagView[];
  onRemove(key: keyof TransactionFilterValues): void;
}

export function ActiveFilterPills({
  filters,
  wallets,
  categories,
  tags,
  onRemove,
}: ActiveFilterPillsProps): JSX.Element | null {
  const t = useT();
  const items: { key: keyof TransactionFilterValues; label: string }[] = [];

  if (filters.q) {
    items.push({ key: 'q', label: `"${filters.q}"` });
  }
  if (filters.type) {
    const typeLabel =
      filters.type === 'expense'
        ? t('personalEntry.expense')
        : filters.type === 'income'
          ? t('personalEntry.income')
          : filters.type === 'transfer'
            ? t('personalEntry.transfer')
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
  if (filters.tagId) {
    const tag = tags.find((x) => x.id === filters.tagId);
    items.push({ key: 'tagId', label: `#${tag?.name ?? filters.tagId}` });
  }
  if (filters.from) {
    items.push({ key: 'from', label: `${t('transactions.fromDate')}: ${filters.from}` });
  }
  if (filters.to) {
    items.push({ key: 'to', label: `${t('transactions.toDate')}: ${filters.to}` });
  }

  if (items.length === 0) return null;

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
          className="inline-flex items-center bg-transparent border-0 p-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
        >
          <Pill tone="accent" className="gap-1 pr-1.5 py-1 text-xs">
            <span>{item.label}</span>
            <Icon name="x" size={12} />
          </Pill>
        </button>
      ))}
    </div>
  );
}
