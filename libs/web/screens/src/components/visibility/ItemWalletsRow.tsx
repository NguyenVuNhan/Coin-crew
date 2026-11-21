import { useMemo, useState, type JSX } from 'react';
import {
  isAssetVisibleIn,
  isCategoryVisibleIn,
  type AssetView,
  type CategoryView,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import {
  useAssets,
  useCategories,
  useSetAssetWallets,
  useSetCategoryWallets,
  useWalletDetails,
} from '@cc/web-data-access/personalMoney';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { cn } from '@cc/web-ui/lib/utils';

export interface ItemWalletsRowProps {
  kind: 'category' | 'asset';
  item: CategoryView | AssetView;
}

export function ItemWalletsRow({ kind, item }: ItemWalletsRowProps): JSX.Element {
  const t = useT();
  const walletsQuery = useWalletDetails();
  const categoriesQuery = useCategories({ enabled: kind === 'category' });
  const assetsQuery = useAssets({ enabled: kind === 'asset' });
  const setCategoryWallets = useSetCategoryWallets();
  const setAssetWallets = useSetAssetWallets();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const wallets = useMemo(
    () => (walletsQuery.data?.wallets ?? []).filter((w) => !w.archived),
    [walletsQuery.data?.wallets],
  );

  const allCategories = categoriesQuery.data?.categories ?? [];
  const allAssets = assetsQuery.data?.assets ?? [];

  const resolvedItem = useMemo(() => {
    if (kind === 'category') {
      return allCategories.find((c) => c.id === item.id) ?? item;
    }
    return allAssets.find((a) => a.id === item.id) ?? item;
  }, [kind, item, allCategories, allAssets]);

  const visibleWallets = useMemo(() => {
    if (kind === 'category') {
      const cat = resolvedItem as CategoryView;
      const catsForLookup = allCategories.length > 0 ? allCategories : [cat];
      return wallets.filter((w) =>
        isCategoryVisibleIn(cat, catsForLookup, { id: w.id, kind: w.kind }),
      );
    }
    const asset = resolvedItem as AssetView;
    return wallets.filter((w) => isAssetVisibleIn(asset, w.id));
  }, [kind, resolvedItem, allCategories, wallets]);

  const summary = useMemo(() => {
    if (visibleWallets.length === 0) return t('visibility.noWallets');
    if (visibleWallets.length === wallets.length) return t('visibility.allWallets');
    if (visibleWallets.length === 1) {
      return t('visibility.onlyWallet', { wallet: visibleWallets[0]!.name });
    }
    if (visibleWallets.length === 2) {
      return `${visibleWallets[0]!.name}, ${visibleWallets[1]!.name}`;
    }
    return t('visibility.nWallets', { n: visibleWallets.length });
  }, [visibleWallets, wallets.length, t]);

  const busy = setCategoryWallets.isPending || setAssetWallets.isPending;
  const error = kind === 'category' ? setCategoryWallets.error : setAssetWallets.error;

  const openSheet = () => {
    setSelectedIds(visibleWallets.map((w) => w.id));
    setCategoryWallets.reset();
    setAssetWallets.reset();
    setSheetOpen(true);
  };

  const toggleWallet = (walletId: string) => {
    setSelectedIds((prev) =>
      prev.includes(walletId) ? prev.filter((id) => id !== walletId) : [...prev, walletId],
    );
  };

  const handleSave = async () => {
    if (busy) return;
    const orderedIds = wallets.filter((w) => selectedIds.includes(w.id)).map((w) => w.id);
    try {
      if (kind === 'category') {
        await setCategoryWallets.mutateAsync({ id: item.id, walletIds: orderedIds });
      } else {
        await setAssetWallets.mutateAsync({ id: item.id, walletIds: orderedIds });
      }
      setSheetOpen(false);
    } catch {
      // Error surfaced via InlineError
    }
  };

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">{t('visibility.itemRowLabel')}</span>
        <button
          type="button"
          data-testid="item-wallets-row"
          onClick={openSheet}
          className="min-h-11 rounded-xl border border-border bg-card px-3 py-2 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="text-base text-foreground truncate">{summary}</span>
          <Icon name="chevronRight" size={18} className="text-muted-foreground shrink-0" />
        </button>
      </div>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={t('visibility.itemRowLabel')}
      >
        <div className="flex flex-col gap-4">
          <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
            {wallets.map((w) => {
              const checked = selectedIds.includes(w.id);
              return (
                <button
                  key={w.id}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  data-testid={`item-wallet-option-${w.id}`}
                  onClick={() => toggleWallet(w.id)}
                  className="min-h-11 w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left text-base text-foreground hover:bg-muted/50 cursor-pointer bg-transparent border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <span className="truncate font-medium">{w.name}</span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-6 rounded-full border grid place-items-center shrink-0 transition-colors motion-reduce:transition-none',
                      checked
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'bg-card border-input text-transparent',
                    )}
                  >
                    <Icon name="check" size={14} />
                  </span>
                </button>
              );
            })}
          </div>

          {error && <InlineError error={error} />}

          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="ghost" onClick={() => setSheetOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={busy}
              data-testid="item-wallets-save-btn"
              onClick={() => void handleSave()}
            >
              {t('visibility.save')}
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
