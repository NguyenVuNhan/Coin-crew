import { foldForSearch } from '@cc/core';
import type { IconName } from '@cc/web-ui/components/icons';

export type AssetIconPackageId = 'crypto' | 'stocks' | 'gold' | 'property';

export interface AssetIconEntry {
  id: string;
  packageId: AssetIconPackageId;
  labelVi: string;
  labelEn: string;
  keywords: readonly string[];
  src: string;
}

export interface AssetIconPackage {
  id: AssetIconPackageId;
  tabLabelVi: string;
  tabLabelEn: string;
  tabIcon: IconName;
  items: readonly AssetIconEntry[];
}

interface RawManifestItem {
  slug: string;
  labelVi: string;
  labelEn: string;
  keywords: readonly string[];
}

const MANIFESTS = import.meta.glob('../assets/asset-icons/*/manifest.json', {
  eager: true,
  import: 'default',
}) as Record<string, readonly RawManifestItem[]>;

const SVG_ICONS = import.meta.glob('../assets/asset-icons/**/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function assetSvgUrl(pkg: AssetIconPackageId, slug: string): string {
  const suffix = `/${pkg}/${slug}.svg`;
  for (const [key, url] of Object.entries(SVG_ICONS)) {
    if (key.replace(/\\/g, '/').endsWith(suffix)) {
      return url;
    }
  }
  return '';
}

function loadManifest(pkg: AssetIconPackageId): readonly RawManifestItem[] {
  const suffix = `/${pkg}/manifest.json`;
  for (const [key, items] of Object.entries(MANIFESTS)) {
    if (key.replace(/\\/g, '/').endsWith(suffix)) {
      return items;
    }
  }
  return [];
}

function buildPackageItems(pkg: AssetIconPackageId): readonly AssetIconEntry[] {
  return loadManifest(pkg).map((item) => ({
    id: `${pkg}:${item.slug}`,
    packageId: pkg,
    labelVi: item.labelVi,
    labelEn: item.labelEn,
    keywords: item.keywords,
    src: assetSvgUrl(pkg, item.slug),
  }));
}

export const ASSET_ICON_PACKAGES: readonly AssetIconPackage[] = [
  {
    id: 'crypto',
    tabLabelVi: 'Tiền mã hóa', // REVIEW
    tabLabelEn: 'Crypto',
    tabIcon: 'coins',
    items: buildPackageItems('crypto'),
  },
  {
    id: 'stocks',
    tabLabelVi: 'Cổ phiếu', // REVIEW
    tabLabelEn: 'Stocks',
    tabIcon: 'candlestick-chart',
    items: buildPackageItems('stocks'),
  },
  {
    id: 'gold',
    tabLabelVi: 'Vàng', // REVIEW
    tabLabelEn: 'Gold',
    tabIcon: 'gem',
    items: buildPackageItems('gold'),
  },
  {
    id: 'property',
    tabLabelVi: 'Tài sản khác', // REVIEW
    tabLabelEn: 'Other',
    tabIcon: 'house',
    items: buildPackageItems('property'),
  },
];

const ASSET_ICON_BY_ID: ReadonlyMap<string, AssetIconEntry> = new Map(
  ASSET_ICON_PACKAGES.flatMap((pkg) => pkg.items.map((item) => [item.id, item] as const)),
);

export function searchAssetIcons(query: string): AssetIconEntry[] {
  const q = foldForSearch(query.trim());
  if (q === '') {
    return ASSET_ICON_PACKAGES.flatMap((pkg) => pkg.items);
  }
  const results: AssetIconEntry[] = [];
  for (const pkg of ASSET_ICON_PACKAGES) {
    for (const item of pkg.items) {
      const matches =
        foldForSearch(item.id).includes(q) ||
        foldForSearch(item.labelVi).includes(q) ||
        foldForSearch(item.labelEn).includes(q) ||
        item.keywords.some((kw) => foldForSearch(kw).includes(q));
      if (matches) {
        results.push(item);
      }
    }
  }
  return results;
}

const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/** Derive 1-3 uppercase characters for an asset's fallback letter tile. */
export function assetLetters(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => HAS_LETTER_OR_DIGIT.test(w));

  if (words.length === 0) {
    return '?';
  }

  if (words.length === 1) {
    const chars = Array.from(words[0]!);
    if (chars.length <= 4) {
      return words[0]!.toLocaleUpperCase('vi');
    }
    return chars.slice(0, 2).join('').toLocaleUpperCase('vi');
  }

  const first = Array.from(words[0]!)[0] ?? '';
  const second = Array.from(words[1]!)[0] ?? '';
  return `${first}${second}`.toLocaleUpperCase('vi');
}

const ASSET_TONE_CLASSES = [
  'bg-avatar-1 text-avatar-1-fg',
  'bg-avatar-2 text-avatar-2-fg',
  'bg-avatar-3 text-avatar-3-fg',
  'bg-avatar-4 text-avatar-4-fg',
  'bg-avatar-5 text-avatar-5-fg',
  'bg-avatar-6 text-avatar-6-fg',
] as const;

export function assetToneClass(seed: string): string {
  let sum = 0;
  for (let i = 0; i < seed.length; i++) {
    sum += seed.charCodeAt(i);
  }
  return ASSET_TONE_CLASSES[sum % ASSET_TONE_CLASSES.length]!;
}

export type ResolvedAssetIcon =
  | { kind: 'svg'; src: string }
  | { kind: 'letters'; text: string; toneClass: string };

export function resolveAssetIcon(
  icon: string | null | undefined,
  asset: { id: string; name: string },
): ResolvedAssetIcon {
  if (icon) {
    const entry = ASSET_ICON_BY_ID.get(icon);
    if (entry?.src) {
      return { kind: 'svg', src: entry.src };
    }
  }
  return {
    kind: 'letters',
    text: assetLetters(asset.name),
    toneClass: assetToneClass(asset.id),
  };
}
