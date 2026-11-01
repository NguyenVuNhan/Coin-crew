import type { AuthProvider } from '@fsl/core';
import { cn } from '@/lib/utils';

// Official artwork, used verbatim (PNG, not redrawn):
// - Google: pre-approved icon-only "Theme=Light, Show text=No, Shape=Square" button @4x, from
//   https://developers.google.com/static/identity/images/signin-assets.zip
//   (already the white rounded square with grey border Google requires behind the G).
// - Zalo: App Store icon, app id 579523206 (VNG ONLINE CO.,LTD), from Apple's lookup API
//   https://itunes.apple.com/lookup?id=579523206 (Zalo publishes no official SVG of its app icon).
const SRC: Record<AuthProvider, string> = {
  google: '/brand/google-signin-icon.png',
  zalo: '/brand/zalo-app-icon.png',
};

export function providerName(provider: AuthProvider): 'Google' | 'Zalo' {
  return provider === 'google' ? 'Google' : 'Zalo';
}

export function ProviderLogo({
  provider,
  size = 20,
  muted = false,
  className,
}: {
  provider: AuthProvider;
  size?: number;
  muted?: boolean;
  className?: string;
}) {
  return (
    <img
      src={SRC[provider]}
      alt=""
      aria-hidden="true"
      data-provider={provider}
      width={size}
      height={size}
      className={cn(
        'fsl-provider-logo block shrink-0 rounded-[20%]',
        muted && 'fsl-provider-logo--muted grayscale opacity-45',
        className,
      )}
    />
  );
}
