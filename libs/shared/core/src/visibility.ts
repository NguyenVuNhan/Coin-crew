import type { AssetView, CategoryView, WalletKind } from './api-types';

export interface WalletOverride {
  walletId: string;
  visible: boolean;
}

export interface VisibilityWallet {
  id: string;
  kind: WalletKind;
}

export const INVESTMENT_VISIBLE_ROOT_KEYS: readonly string[] = ['fees'];

/** Walk `parentId` up to the root category, stopping if a cycle is encountered. */
export function categoryRoot(cat: CategoryView, all: CategoryView[]): CategoryView {
  const byId = new Map<string, CategoryView>();
  for (const item of all) {
    byId.set(item.id, item);
  }

  const seen = new Set<string>([cat.id]);
  let current = cat;
  while (current.parentId !== null) {
    if (seen.has(current.parentId)) break;
    const parent = byId.get(current.parentId);
    if (!parent) break;
    seen.add(parent.id);
    current = parent;
  }
  return current;
}

/** Default visibility for a category in a wallet of `kind` when no override exists. */
export function categoryDefaultVisible(
  cat: CategoryView,
  all: CategoryView[],
  kind: WalletKind,
): boolean {
  if (kind === 'everyday') return true;
  if (cat.type === 'income') return true;
  const root = categoryRoot(cat, all);
  return (
    root.starterKey !== null &&
    INVESTMENT_VISIBLE_ROOT_KEYS.includes(root.starterKey)
  );
}

/** Effective visibility of a category in `wallet`, preferring an explicit override. */
export function isCategoryVisibleIn(
  cat: CategoryView,
  all: CategoryView[],
  wallet: VisibilityWallet,
): boolean {
  const override = cat.walletOverrides.find((o) => o.walletId === wallet.id);
  if (override !== undefined) return override.visible;
  return categoryDefaultVisible(cat, all, wallet.kind);
}

/** Effective visibility of an asset in `walletId`, defaulting to true. */
export function isAssetVisibleIn(asset: AssetView, walletId: string): boolean {
  const override = asset.walletOverrides.find((o) => o.walletId === walletId);
  return override !== undefined ? override.visible : true;
}

/**
 * Overrides inherited by a newly created asset in `groupName`: hidden in each
 * wallet where every existing asset in that group is already hidden.
 */
export function inheritedAssetOverrides(
  groupName: string,
  assets: AssetView[],
  wallets: VisibilityWallet[],
): WalletOverride[] {
  const groupAssets = assets.filter((a) => a.groupName === groupName);
  if (groupAssets.length === 0) return [];
  const overrides: WalletOverride[] = [];
  for (const wallet of wallets) {
    if (groupAssets.every((a) => !isAssetVisibleIn(a, wallet.id))) {
      overrides.push({ walletId: wallet.id, visible: false });
    }
  }
  return overrides;
}
