import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AssetIcon } from '../AssetIcon';
import {
  ASSET_ICON_PACKAGES,
  assetLetters,
  assetToneClass,
  resolveAssetIcon,
  searchAssetIcons,
} from '../../lib/assetIcon';

const VALID_TONES = [
  'bg-avatar-1 text-avatar-1-fg',
  'bg-avatar-2 text-avatar-2-fg',
  'bg-avatar-3 text-avatar-3-fg',
  'bg-avatar-4 text-avatar-4-fg',
  'bg-avatar-5 text-avatar-5-fg',
  'bg-avatar-6 text-avatar-6-fg',
];

describe('assetIcon registry and <AssetIcon>', () => {
  it('loads 4 packs with 17/14/12/14 items, valid ids, and truthy src URLs', () => {
    expect(ASSET_ICON_PACKAGES.map((p) => p.id)).toEqual([
      'crypto',
      'stocks',
      'gold',
      'property',
    ]);
    expect(ASSET_ICON_PACKAGES.map((p) => p.items.length)).toEqual([17, 14, 12, 14]);

    for (const pkg of ASSET_ICON_PACKAGES) {
      for (const item of pkg.items) {
        expect(item.src).toBeTruthy();
        expect(item.id).toMatch(/^(crypto|stocks|gold|property):[a-z0-9-]+$/);
      }
    }
  });

  it('resolves known icons to svg and unknown/missing icons to letters', () => {
    const asset = { id: 'a1', name: 'Bitcoin' };

    const btc = resolveAssetIcon('crypto:btc', asset);
    expect(btc.kind).toBe('svg');
    if (btc.kind === 'svg') {
      expect(btc.src).toBeTruthy();
    }

    for (const fallback of ['crypto:shib', 'junk', null, undefined]) {
      const resolved = resolveAssetIcon(fallback, asset);
      expect(resolved.kind).toBe('letters');
    }
  });

  it('derives letter tile text from asset names', () => {
    expect(assetLetters('BTC')).toBe('BTC');
    expect(assetLetters('vnm')).toBe('VNM');
    expect(assetLetters('Bitcoin')).toBe('BI');
    expect(assetLetters('Vàng SJC')).toBe('VS');
    expect(assetLetters('nhẫn trơn 9999')).toBe('NT');
    expect(assetLetters('  ')).toBe('?');
    expect(assetLetters('🚀 Moon')).toBe('MOON');
  });

  it('returns deterministic avatar tone pairs from assetToneClass', () => {
    const tone = assetToneClass('a1');
    expect(tone).toBe(assetToneClass('a1'));
    expect(VALID_TONES).toContain(tone);
  });

  it('searches across all packs with Vietnamese folding', () => {
    expect(searchAssetIcons('vang').some((i) => i.id === 'gold:gold-bar')).toBe(true);
    expect(searchAssetIcons('BTC').some((i) => i.id === 'crypto:btc')).toBe(true);
  });

  it('renders letter tile for null/unknown icon and svg image for known icon', () => {
    const { unmount } = render(
      <AssetIcon asset={{ id: 'a', name: 'Vàng SJC', icon: null }} />,
    );
    const tile = screen.getByTestId('asset-icon');
    expect(tile).toHaveAttribute('aria-hidden', 'true');
    expect(tile).toHaveTextContent('VS');
    unmount();

    const { container } = render(
      <AssetIcon asset={{ id: 'b', name: 'Bitcoin', icon: 'crypto:btc' }} />,
    );
    expect(container.querySelector('img')).not.toBeNull();
  });
});
