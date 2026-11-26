import type { JSX } from 'react';
import { cn } from '@cc/web-ui/lib/utils';
import { resolveAssetIcon } from '../lib/assetIcon';

export {
  ASSET_ICON_PACKAGES,
  assetLetters,
  assetToneClass,
  resolveAssetIcon,
  searchAssetIcons,
  type AssetIconEntry,
  type AssetIconPackage,
  type AssetIconPackageId,
  type ResolvedAssetIcon,
} from '../lib/assetIcon';

export type AssetIconSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<AssetIconSize, string> = {
  xs: 'size-7 rounded-lg',
  sm: 'size-9 rounded-xl',
  md: 'size-10 rounded-xl',
  lg: 'size-12 rounded-xl',
};

const LETTER_TEXT_CLASSES: Record<AssetIconSize, string> = {
  xs: 'text-xs',
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

export interface AssetIconProps {
  asset: { id: string; name: string; icon?: string | null };
  size?: AssetIconSize;
  className?: string;
}

export function AssetIcon({ asset, size = 'md', className }: AssetIconProps): JSX.Element {
  const resolved = resolveAssetIcon(asset.icon, asset);
  const sizeCls = SIZE_CLASSES[size];

  if (resolved.kind === 'svg') {
    return (
      <div
        aria-hidden="true"
        data-testid="asset-icon"
        className={cn(
          'grid place-items-center shrink-0 bg-card border border-border p-1',
          sizeCls,
          className,
        )}
      >
        <img src={resolved.src} alt="" className="size-full object-contain" />
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      data-testid="asset-icon"
      className={cn(
        'grid place-items-center shrink-0 font-semibold leading-none select-none',
        sizeCls,
        LETTER_TEXT_CLASSES[size],
        resolved.toneClass,
        className,
      )}
    >
      {resolved.text}
    </div>
  );
}
