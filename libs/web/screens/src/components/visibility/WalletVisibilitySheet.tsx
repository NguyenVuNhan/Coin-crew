import { useEffect, useMemo, useState, type JSX } from 'react';
import {
  isAssetVisibleIn,
  isCategoryVisibleIn,
  type AssetView,
  type CategoryView,
  type WalletDetailView,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import {
  useAssets,
  useCategories,
  useSetWalletVisibility,
  type VisibilityChange,
} from '@cc/web-data-access/personalMoney';
import { Icon } from '@cc/web-ui/components/icons';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { Snackbar } from '@cc/web-ui/components/Snackbar';
import { Switch } from '@cc/web-ui/components/ui/switch';
import { categoryIconName } from '../categoryIcon';

export interface WalletVisibilitySheetProps {
  open: boolean;
  onClose(): void;
  wallet: WalletDetailView;
}

export function WalletVisibilitySheet({
  open,
  onClose,
  wallet,
}: WalletVisibilitySheetProps): JSX.Element {
  const t = useT();
  const categoriesQuery = useCategories({ enabled: open });
  const assetsQuery = useAssets({ enabled: open });
  const setWalletVisibility = useSetWalletVisibility();

  const [expandedCats, setExpandedCats] = useState<Set<string>>(() => new Set());
  const [expandedAssetGroups, setExpandedAssetGroups] = useState<Set<string>>(() => new Set());
  const [optimisticCats, setOptimisticCats] = useState<Record<string, boolean>>({});
  const [optimisticAssets, setOptimisticAssets] = useState<Record<string, boolean>>({});
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setOptimisticCats({});
      setOptimisticAssets({});
      setSnackbarMessage(null);
    }
  }, [open, wallet.id]);

  const allCategories = categoriesQuery.data?.categories ?? [];
  const allAssets = assetsQuery.data?.assets ?? [];

  const { expenseRoots, incomeRoots, subsByParent } = useMemo(() => {
    const active = allCategories.filter((c) => !c.hidden);
    const childMap = new Map<string, CategoryView[]>();
    for (const c of active) {
      if (c.parentId !== null) {
        const list = childMap.get(c.parentId) ?? [];
        list.push(c);
        childMap.set(c.parentId, list);
      }
    }
    for (const list of childMap.values()) {
      list.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    const exp = active
      .filter((c) => c.type === 'expense' && c.parentId === null)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const inc = active
      .filter((c) => c.type === 'income' && c.parentId === null)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return { expenseRoots: exp, incomeRoots: inc, subsByParent: childMap };
  }, [allCategories]);

  const assetGroups = useMemo(() => {
    const active = allAssets.filter((a) => !a.hidden).sort((a, b) => a.sortOrder - b.sortOrder);
    const map = new Map<string, AssetView[]>();
    for (const asset of active) {
      const list = map.get(asset.groupName) ?? [];
      list.push(asset);
      map.set(asset.groupName, list);
    }
    return Array.from(map.entries()).map(([groupName, assets]) => ({ groupName, assets }));
  }, [allAssets]);

  const walletRef = useMemo(
    () => ({ id: wallet.id, kind: wallet.kind }),
    [wallet.id, wallet.kind],
  );

  const isCatVisible = (cat: CategoryView): boolean =>
    cat.id in optimisticCats
      ? optimisticCats[cat.id]!
      : isCategoryVisibleIn(cat, allCategories, walletRef);

  const isAssetVisible = (asset: AssetView): boolean =>
    asset.id in optimisticAssets
      ? optimisticAssets[asset.id]!
      : isAssetVisibleIn(asset, wallet.id);

  const applyCategoryChanges = (changes: VisibilityChange[]) => {
    const prevSnapshot: Record<string, boolean | undefined> = {};
    for (const ch of changes) {
      prevSnapshot[ch.id] = optimisticCats[ch.id];
    }

    setSnackbarMessage(null);
    setOptimisticCats((prev) => {
      const next = { ...prev };
      for (const ch of changes) {
        next[ch.id] = ch.visible;
      }
      return next;
    });

    setWalletVisibility.mutate(
      { walletId: wallet.id, categories: changes },
      {
        onError: () => {
          setOptimisticCats((prev) => {
            const next = { ...prev };
            for (const ch of changes) {
              const old = prevSnapshot[ch.id];
              if (old === undefined) {
                delete next[ch.id];
              } else {
                next[ch.id] = old;
              }
            }
            return next;
          });
          setSnackbarMessage(t('visibility.saveFailed'));
        },
      },
    );
  };

  const applyAssetChanges = (changes: VisibilityChange[]) => {
    const prevSnapshot: Record<string, boolean | undefined> = {};
    for (const ch of changes) {
      prevSnapshot[ch.id] = optimisticAssets[ch.id];
    }

    setSnackbarMessage(null);
    setOptimisticAssets((prev) => {
      const next = { ...prev };
      for (const ch of changes) {
        next[ch.id] = ch.visible;
      }
      return next;
    });

    setWalletVisibility.mutate(
      { walletId: wallet.id, assets: changes },
      {
        onError: () => {
          setOptimisticAssets((prev) => {
            const next = { ...prev };
            for (const ch of changes) {
              const old = prevSnapshot[ch.id];
              if (old === undefined) {
                delete next[ch.id];
              } else {
                next[ch.id] = old;
              }
            }
            return next;
          });
          setSnackbarMessage(t('visibility.saveFailed'));
        },
      },
    );
  };

  const toggleCatExpand = (id: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAssetGroupExpand = (groupName: string) => {
    setExpandedAssetGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };

  const renderCategoryGroup = (roots: CategoryView[], heading: string) => {
    if (roots.length === 0) return null;
    return (
      <div className="flex flex-col gap-1.5">
        <h3 className="m-0 px-1 text-sm font-semibold text-muted-foreground">{heading}</h3>
        <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
          {roots.map((parent) => {
            const subs = subsByParent.get(parent.id) ?? [];
            const parentVisible = isCatVisible(parent);
            const visibleSubsCount = subs.filter(isCatVisible).length;
            const isMixed =
              subs.length > 0 &&
              ((visibleSubsCount > 0 && visibleSubsCount < subs.length) ||
                parentVisible !== (visibleSubsCount === subs.length));
            const isExpanded = expandedCats.has(parent.id);

            return (
              <div key={parent.id} className="divide-y divide-border">
                <div className="min-h-11 px-4 py-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="size-8 rounded-lg bg-muted grid place-items-center shrink-0 text-foreground">
                      <Icon name={categoryIconName(parent.icon, parent.type)} size={16} />
                    </span>
                    <span className="text-sm font-semibold text-foreground truncate">
                      {parent.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isMixed && (
                      <span className="text-xs font-medium text-muted-foreground tabular-nums">
                        {visibleSubsCount}/{subs.length}
                      </span>
                    )}
                    {subs.length > 0 && (
                      <button
                        type="button"
                        data-testid={`vis-cat-expand-${parent.id}`}
                        aria-expanded={isExpanded}
                        aria-label={
                          isExpanded
                            ? t('visibility.collapse', { name: parent.name })
                            : t('visibility.expand', { name: parent.name })
                        }
                        onClick={() => toggleCatExpand(parent.id)}
                        className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer border-0 bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Icon name={isExpanded ? 'chevronUp' : 'chevronDown'} size={18} />
                      </button>
                    )}
                    <Switch
                      data-testid={`vis-cat-${parent.id}`}
                      aria-label={parent.name}
                      checked={parentVisible}
                      onCheckedChange={(checked) => {
                        const changes: VisibilityChange[] = [
                          { id: parent.id, visible: checked },
                          ...subs.map((sub) => ({ id: sub.id, visible: checked })),
                        ];
                        applyCategoryChanges(changes);
                      }}
                    />
                  </div>
                </div>

                {isExpanded &&
                  subs.map((sub) => (
                    <div
                      key={sub.id}
                      className="min-h-11 pl-12 pr-4 py-2 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="size-7 rounded-lg bg-muted grid place-items-center shrink-0 text-foreground">
                          <Icon name={categoryIconName(sub.icon, sub.type)} size={14} />
                        </span>
                        <span className="text-sm text-foreground truncate">{sub.name}</span>
                      </div>
                      <Switch
                        data-testid={`vis-cat-${sub.id}`}
                        aria-label={sub.name}
                        checked={isCatVisible(sub)}
                        onCheckedChange={(checked) => {
                          applyCategoryChanges([{ id: sub.id, visible: checked }]);
                        }}
                      />
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const isLoading = categoriesQuery.isPending || assetsQuery.isPending;
  const loadError = categoriesQuery.error ?? assetsQuery.error;

  return (
    <Sheet open={open} onClose={onClose} title={t('visibility.walletSheetTitle')}>
      <div data-testid="wallet-visibility-sheet" className="flex flex-col gap-5 pb-2">
          {isLoading ? (
            <SkeletonList rows={5} />
          ) : loadError ? (
            <InlineError
              error={loadError}
              onRetry={() => {
                void categoriesQuery.refetch();
                void assetsQuery.refetch();
              }}
            />
          ) : (
            <>
              {(expenseRoots.length > 0 || incomeRoots.length > 0) && (
                <section className="flex flex-col gap-3">
                  <h2 className="m-0 px-1 text-base font-semibold text-foreground">
                    {t('visibility.categories')}
                  </h2>
                  {renderCategoryGroup(expenseRoots, t('visibility.expense'))}
                  {renderCategoryGroup(incomeRoots, t('visibility.income'))}
                </section>
              )}

              {assetGroups.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h2 className="m-0 px-1 text-base font-semibold text-foreground">
                    {t('visibility.assets')}
                  </h2>
                  <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
                    {assetGroups.map(({ groupName, assets }) => {
                      const visibleCount = assets.filter(isAssetVisible).length;
                      const groupChecked = visibleCount > 0;
                      const isMixed = visibleCount > 0 && visibleCount < assets.length;
                      const isExpanded = expandedAssetGroups.has(groupName);

                      return (
                        <div key={groupName} className="divide-y divide-border">
                          <div className="min-h-11 px-4 py-2 flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-foreground truncate flex-1 min-w-0">
                              {groupName}
                            </span>

                            <div className="flex items-center gap-2 shrink-0">
                              {isMixed && (
                                <span className="text-xs font-medium text-muted-foreground tabular-nums">
                                  {visibleCount}/{assets.length}
                                </span>
                              )}
                              <button
                                type="button"
                                data-testid={`vis-asset-expand-${groupName}`}
                                aria-expanded={isExpanded}
                                aria-label={
                                  isExpanded
                                    ? t('visibility.collapse', { name: groupName })
                                    : t('visibility.expand', { name: groupName })
                                }
                                onClick={() => toggleAssetGroupExpand(groupName)}
                                className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer border-0 bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <Icon name={isExpanded ? 'chevronUp' : 'chevronDown'} size={18} />
                              </button>
                              <Switch
                                data-testid={`vis-asset-group-${groupName}`}
                                aria-label={groupName}
                                checked={groupChecked}
                                onCheckedChange={(checked) => {
                                  applyAssetChanges(
                                    assets.map((a) => ({ id: a.id, visible: checked })),
                                  );
                                }}
                              />
                            </div>
                          </div>

                          {isExpanded &&
                            assets.map((asset) => (
                              <div
                                key={asset.id}
                                className="min-h-11 pl-10 pr-4 py-2 flex items-center justify-between gap-2"
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span className="text-sm text-foreground truncate">
                                    {asset.name}
                                  </span>
                                  {asset.unit && (
                                    <span className="text-xs text-muted-foreground shrink-0">
                                      {asset.unit}
                                    </span>
                                  )}
                                </div>
                                <Switch
                                  data-testid={`vis-asset-${asset.id}`}
                                  aria-label={asset.name}
                                  checked={isAssetVisible(asset)}
                                  onCheckedChange={(checked) => {
                                    applyAssetChanges([{ id: asset.id, visible: checked }]);
                                  }}
                                />
                              </div>
                            ))}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
        {snackbarMessage && <Snackbar message={snackbarMessage} />}
      </Sheet>
  );
}
