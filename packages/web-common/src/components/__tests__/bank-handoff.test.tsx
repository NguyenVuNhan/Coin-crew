import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import type { BankApp } from '@fsl/core';
import { fakePlatform } from '../../test/fakePlatform';
import { PlatformProvider } from '../../platform';
import { setLang } from '../../i18n';
import { BankHandoffSheet } from '../BankHandoffSheet';

const fixtureApp: BankApp = {
  appId: 'acb',
  appName: 'ACB ONE',
  bankName: 'x',
  bankShortName: 'ACB',
  bankCode: 'ACB',
  monthlyInstall: 1,
};

const defaultMakePng = async () => new Blob(['x'], { type: 'image/png' });

function renderHandoff(
  props: Partial<React.ComponentProps<typeof BankHandoffSheet>> = {},
  platform = fakePlatform(),
) {
  setLang('en');
  const utils = render(
    <PlatformProvider platform={platform}>
      <BankHandoffSheet
        open={true}
        onClose={vi.fn()}
        app={fixtureApp}
        makePng={defaultMakePng}
        fileName="vietqr-test.png"
        {...props}
      />
    </PlatformProvider>,
  );
  return { ...utils, platform };
}

describe('BankHandoffSheet', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setLang('en');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('saves, then opens the bank 500 ms later', async () => {
    const platform = fakePlatform();
    renderHandoff({}, platform);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const step1 = document.querySelector('[data-step="1"]');
    expect(step1).toHaveAttribute('data-state', 'saved');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(499);
    });
    expect(platform.calls.openExternal).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(platform.calls.openExternal).toHaveLength(1);
    expect(platform.calls.openExternal[0]).toEqual(['https://dl.vietqr.io/pay?app=acb']);
  });

  it('shows the Open button after 3 s when the page never hid', async () => {
    const platform = fakePlatform();
    renderHandoff({}, platform);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(platform.calls.openExternal).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    const step2 = document.querySelector('[data-step="2"]');
    expect(step2).toHaveAttribute('data-state', 'open-failed');
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('blocked opens the fallback at once', async () => {
    const platform = fakePlatform({
      openExternal: async () => 'blocked',
    });
    renderHandoff({}, platform);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const step2 = document.querySelector('[data-step="2"]');
    expect(step2).toHaveAttribute('data-state', 'open-failed');
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('hidden then visible marks the bank opened', async () => {
    const platform = fakePlatform();
    renderHandoff({}, platform);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      writable: true,
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    const step2 = document.querySelector('[data-step="2"]');
    expect(step2).toHaveAttribute('data-state', 'opened');
    expect(
      screen.getByText('In ACB ONE: Scan QR → upload picture → pick the saved QR.'),
    ).toBeInTheDocument();
  });

  it('cancelled save offers Save and still opens the bank', async () => {
    const saveImage = vi
      .fn()
      .mockResolvedValueOnce('cancelled' as const)
      .mockResolvedValueOnce('saved' as const);
    const platform = fakePlatform({ saveImage });
    renderHandoff({}, platform);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const step1 = document.querySelector('[data-step="1"]');
    expect(step1).toHaveAttribute('data-state', 'save-failed');
    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(platform.calls.openExternal).toHaveLength(1);

    await act(async () => {
      fireEvent.click(saveButton);
    });
    expect(saveImage).toHaveBeenCalledTimes(2);
  });

  it('failed save calls onSaveFailed', async () => {
    const onSaveFailed = vi.fn();
    const platform = fakePlatform({
      saveImage: async () => 'failed',
    });
    renderHandoff({ onSaveFailed }, platform);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(onSaveFailed).toHaveBeenCalledTimes(1);
  });

  it('closing mid-flow cancels the open', async () => {
    const platform = fakePlatform();
    const { rerender } = renderHandoff({}, platform);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    rerender(
      <PlatformProvider platform={platform}>
        <BankHandoffSheet
          open={false}
          onClose={vi.fn()}
          app={fixtureApp}
          makePng={defaultMakePng}
          fileName="vietqr-test.png"
        />
      </PlatformProvider>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(platform.calls.openExternal).toHaveLength(0);
  });

  it('opening twice runs one save', async () => {
    const platform = fakePlatform();
    const { rerender } = renderHandoff({}, platform);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    rerender(
      <PlatformProvider platform={platform}>
        <BankHandoffSheet
          open={true}
          onClose={vi.fn()}
          app={fixtureApp}
          makePng={defaultMakePng}
          fileName="vietqr-test.png"
        />
      </PlatformProvider>,
    );

    expect(platform.calls.saveImage).toHaveLength(1);
  });

  it('Zalo webview shows the Zalo-asks hint', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Zalo/24.01.01',
    });

    const platform = fakePlatform();
    renderHandoff({}, platform);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByText('Zalo will ask: choose "Continue"')).toBeInTheDocument();
  });
});
