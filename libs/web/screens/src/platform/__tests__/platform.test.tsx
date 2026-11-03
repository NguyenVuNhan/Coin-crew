import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePlatform, PlatformProvider, browserPlatform, type ShareCard } from '../index';
import { fakePlatform } from '../../test/fakePlatform';

describe('platform', () => {
  let originalShareDesc: PropertyDescriptor | undefined;
  let originalClipboardDesc: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalShareDesc = Object.getOwnPropertyDescriptor(navigator, 'share');
    originalClipboardDesc = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalShareDesc) {
      Object.defineProperty(navigator, 'share', originalShareDesc);
    } else {
      delete (navigator as { share?: unknown }).share;
    }
    if (originalClipboardDesc) {
      Object.defineProperty(navigator, 'clipboard', originalClipboardDesc);
    } else {
      delete (navigator as { clipboard?: unknown }).clipboard;
    }
  });

  function KindProbe() {
    const platform = usePlatform();
    return <div data-testid="kind">{platform.kind}</div>;
  }

  it('usePlatform defaults to the browser platform', () => {
    render(<KindProbe />);
    expect(screen.getByTestId('kind')).toHaveTextContent('web');
  });

  it('PlatformProvider supplies another platform', () => {
    const fake = fakePlatform();
    render(
      <PlatformProvider platform={fake}>
        <KindProbe />
      </PlatformProvider>,
    );
    expect(screen.getByTestId('kind')).toHaveTextContent('zmp');
  });

  it('browser share reports a cancelled share sheet', async () => {
    const shareMock = vi.fn().mockRejectedValue({ name: 'AbortError' });
    Object.defineProperty(navigator, 'share', {
      value: shareMock,
      configurable: true,
      writable: true,
    });

    const card: ShareCard = {
      title: 'Trip 1',
      description: 'Trip description',
      path: 'j/trip-1',
      thumbnailUrl: 'https://example.com/thumb.png',
      text: 'Check this out',
      url: 'https://example.com/j/trip-1',
    };

    const result = await browserPlatform.share(card);
    expect(result).toBe('cancelled');
    expect(shareMock).toHaveBeenCalledWith({
      title: 'Trip 1',
      text: 'Check this out',
      url: 'https://example.com/j/trip-1',
    });
  });

  it('browser share falls back to the clipboard', async () => {
    delete (navigator as { share?: unknown }).share;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    const card: ShareCard = {
      title: 'Trip 1',
      description: 'Trip description',
      path: 'j/trip-1',
      thumbnailUrl: 'https://example.com/thumb.png',
      text: 'Hi',
      url: 'https://x.test',
    };

    const result = await browserPlatform.share(card);
    expect(result).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('Hi https://x.test');
  });

  it('browser storage round-trips', async () => {
    await browserPlatform.storage.set('session-key', 'session-token-value');
    expect(await browserPlatform.storage.get('session-key')).toBe('session-token-value');
    await browserPlatform.storage.remove('session-key');
    expect(await browserPlatform.storage.get('session-key')).toBeNull();
  });

  it('fakePlatform records calls', async () => {
    const fake = fakePlatform();
    const card: ShareCard = {
      title: 'Trip 2',
      description: 'Trip description 2',
      path: 'j/trip-2',
      thumbnailUrl: 'https://example.com/thumb2.png',
      text: 'Join us',
      url: 'https://example.com/j/trip-2',
    };

    const result = await fake.share(card);
    expect(result).toBe('shared');
    expect(fake.calls.share?.[0]?.[0]).toBe(card);
  });

  it('fakePlatform records storage calls and uses in-memory store', async () => {
    const fake = fakePlatform();
    await fake.storage.set('foo', 'bar');
    expect(fake.calls['storage.set']?.[0]).toEqual(['foo', 'bar']);
    expect(fake.store.get('foo')).toBe('bar');

    const val = await fake.storage.get('foo');
    expect(fake.calls['storage.get']?.[0]).toEqual(['foo']);
    expect(val).toBe('bar');

    await fake.storage.remove('foo');
    expect(fake.calls['storage.remove']?.[0]).toEqual(['foo']);
    expect(fake.store.has('foo')).toBe(false);
  });

  it('fakePlatform allows overrides while still recording calls', async () => {
    const customShare = vi.fn().mockResolvedValue('failed' as const);
    const fake = fakePlatform({ share: customShare });
    const card: ShareCard = {
      title: 'Trip 3',
      description: 'Desc',
      path: 'j/trip-3',
      thumbnailUrl: 'https://example.com/thumb3.png',
      text: 'Test',
      url: 'https://example.com/j/trip-3',
    };

    const result = await fake.share(card);
    expect(result).toBe('failed');
    expect(customShare).toHaveBeenCalledWith(card);
    expect(fake.calls.share?.[0]?.[0]).toBe(card);
  });

  it('browser platform Zalo methods resolve null', async () => {
    expect(await browserPlatform.zaloAccessToken()).toBeNull();
    expect(await browserPlatform.zaloUserInfo()).toBeNull();
    expect(await browserPlatform.chatContext()).toBeNull();
    expect(await browserPlatform.pickZaloFriends(5)).toBeNull();
  });
});
