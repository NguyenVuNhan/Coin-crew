import type { JSX } from 'react';
import { Icon } from '@cc/web-ui/components/icons';
import { cn } from '@cc/web-ui/lib/utils';
import { resolveWalletIcon } from '../lib/walletIcon';

export {
  WALLET_AVATAR_TONES,
  WALLET_ICON_PACKAGES,
  WALLET_PASTEL_TONES,
  resolveWalletIcon,
  searchWalletIcons,
  walletIconClass,
  type BasicWalletGlyph,
  type ResolvedWalletIcon,
  type WalletIconEntry,
  type WalletIconPackage,
  type WalletIconPackageId,
  type WalletPastelTone,
} from '../lib/walletIcon';

export type WalletIconSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<WalletIconSize, string> = {
  xs: 'size-7 rounded-lg',
  sm: 'size-9 rounded-xl',
  md: 'size-10 rounded-xl',
  lg: 'size-12 rounded-xl',
};

const GLYPH_SIZES: Record<WalletIconSize, number> = {
  xs: 15,
  sm: 18,
  md: 20,
  lg: 24,
};

export interface WalletIconProps {
  icon: string | null | undefined;
  size?: WalletIconSize;
  className?: string;
}

export function WalletIcon({ icon, size = 'md', className }: WalletIconProps): JSX.Element {
  const resolved = resolveWalletIcon(icon);
  const sizeCls = SIZE_CLASSES[size];

  if (resolved.kind === 'basic') {
    return (
      <div
        aria-hidden="true"
        className={cn('grid place-items-center shrink-0', sizeCls, resolved.toneClass, className)}
      >
        <Icon name={resolved.iconName} size={GLYPH_SIZES[size]} />
      </div>
    );
  }

  if (resolved.kind === 'bank') {
    return (
      <div
        aria-hidden="true"
        className={cn(
          'grid place-items-center shrink-0 bg-card border border-border overflow-hidden',
          sizeCls,
          className,
        )}
      >
        <img src={resolved.src} alt="" className="size-full object-cover" />
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className={cn(
        'grid place-items-center shrink-0 bg-card border border-border p-1.5',
        sizeCls,
        className,
      )}
    >
      <img src={resolved.src} alt="" className="size-full object-contain" />
    </div>
  );
}
