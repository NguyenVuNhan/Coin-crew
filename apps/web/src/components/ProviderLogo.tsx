import type { AuthProvider } from '@fsl/core';
import './ProviderLogo.css';

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
}: {
  provider: AuthProvider;
  size?: number;
  muted?: boolean;
}) {
  return (
    <img
      src={SRC[provider]}
      alt=""
      aria-hidden="true"
      data-provider={provider}
      width={size}
      height={size}
      className={`fsl-provider-logo${muted ? ' fsl-provider-logo--muted' : ''}`}
    />
  );
}
