import { describe, it, expect } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { BankApp } from '@cc/core';
import { fakePlatform } from '../../test/fakePlatform';
import { PlatformProvider } from '@cc/web-platform';
import {
  BANK_APP_KEY,
  deviceBankApps,
  bankAppLogo,
  loadRememberedBankApp,
  rememberBankApp,
  useRememberedBankApp,
} from '../bankApps';

const sampleAcb: BankApp = {
  appId: 'acb',
  appName: 'ACB ONE',
  bankName: 'Ngân hàng TMCP Á Châu',
  bankShortName: 'ACB',
  bankCode: 'ACB',
  monthlyInstall: 70000,
};

const sampleMb: BankApp = {
  appId: 'mb',
  appName: 'MB Bank',
  bankName: 'Ngân hàng TMCP Quân đội',
  bankShortName: 'MBBank',
  bankCode: 'MB',
  monthlyInstall: 500000,
};

describe('bankApps', () => {
  it('returns the stored app when it is in the list', async () => {
    const platform = fakePlatform();
    platform.store.set(BANK_APP_KEY, 'acb');
    const apps = [sampleAcb, sampleMb];

    const result = await loadRememberedBankApp(platform.storage, apps);
    expect(result).toBe(sampleAcb);
  });

  it('ignores an id that is not in this platform list', async () => {
    const platform = fakePlatform();
    platform.store.set(BANK_APP_KEY, 'nope');
    const apps = [sampleAcb, sampleMb];

    const result = await loadRememberedBankApp(platform.storage, apps);
    expect(result).toBeNull();
  });

  it("ignores an id that is not in this platform's list", async () => {
    const platform = fakePlatform();
    platform.store.set(BANK_APP_KEY, 'nope');
    const apps = [sampleAcb, sampleMb];

    const result = await loadRememberedBankApp(platform.storage, apps);
    expect(result).toBeNull();
  });

  it('storage that throws counts as nothing remembered', async () => {
    const platform = fakePlatform({
      storage: {
        get: async () => {
          throw new Error('x');
        },
        set: async () => {},
        remove: async () => {},
      },
    });

    const result = await loadRememberedBankApp(platform.storage, [sampleAcb]);
    expect(result).toBeNull();
  });

  it('rememberBankApp writes the id under fsl.bankApp', async () => {
    const platform = fakePlatform();
    await rememberBankApp(platform.storage, 'acb');

    expect(platform.calls['storage.set']).toContainEqual([BANK_APP_KEY, 'acb']);
    expect(platform.store.get(BANK_APP_KEY)).toBe('acb');
  });

  it('bankAppLogo gives a URL for a known app and undefined for an unknown one', () => {
    const logo = bankAppLogo('mb');
    expect(logo).toBeDefined();
    expect(typeof logo).toBe('string');

    const unknownLogo = bankAppLogo('nope');
    expect(unknownLogo).toBeUndefined();
  });

  it('deviceBankApps returns bank apps list', () => {
    const apps = deviceBankApps();
    expect(Array.isArray(apps)).toBe(true);
    expect(apps.length).toBeGreaterThan(0);
  });

  it('useRememberedBankApp loads remembered app and updates via remember', async () => {
    const platform = fakePlatform();
    platform.store.set(BANK_APP_KEY, 'mb');

    const wrapper = ({ children }: { children: ReactNode }) => (
      <PlatformProvider platform={platform}>{children}</PlatformProvider>
    );

    const { result } = renderHook(() => useRememberedBankApp(), { wrapper });

    await waitFor(() => {
      expect(result.current.app?.appId).toBe('mb');
    });

    act(() => {
      result.current.remember(sampleAcb);
    });

    expect(result.current.app).toEqual(sampleAcb);
    expect(platform.store.get(BANK_APP_KEY)).toBe('acb');
  });
});
