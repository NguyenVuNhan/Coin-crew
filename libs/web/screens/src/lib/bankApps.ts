import { useState, useEffect, useCallback } from 'react';
import { BANK_APPS, type BankApp } from '@cc/core';
import { isIosDevice } from '../platform/browser';
import { usePlatform, type PlatformStorage } from '../platform';

export const BANK_APP_KEY = 'fsl.bankApp';

export function deviceBankApps(): BankApp[] {
  return isIosDevice() ? BANK_APPS.ios : BANK_APPS.android;
}

const LOGOS = import.meta.glob('../assets/bank-apps/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export function bankAppLogo(appId: string): string | undefined {
  const platform = isIosDevice() ? 'ios' : 'android';
  const suffix = `/${platform}-${appId}.webp`;
  for (const [key, url] of Object.entries(LOGOS)) {
    if (key.replace(/\\/g, '/').endsWith(suffix)) {
      return url;
    }
  }
  return undefined;
}

export async function loadRememberedBankApp(
  storage: PlatformStorage,
  apps: BankApp[],
): Promise<BankApp | null> {
  try {
    const id = await storage.get(BANK_APP_KEY);
    if (!id) return null;
    return apps.find((app) => app.appId === id) ?? null;
  } catch {
    return null;
  }
}

export async function rememberBankApp(storage: PlatformStorage, appId: string): Promise<void> {
  await storage.set(BANK_APP_KEY, appId);
}

export function useRememberedBankApp(): {
  app: BankApp | null;
  remember(app: BankApp): void;
} {
  const { storage } = usePlatform();
  const [app, setApp] = useState<BankApp | null>(null);

  useEffect(() => {
    let cancelled = false;
    const apps = deviceBankApps();
    loadRememberedBankApp(storage, apps).then((loaded) => {
      if (!cancelled) {
        setApp((prev) => prev ?? loaded);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const remember = useCallback(
    (nextApp: BankApp) => {
      setApp(nextApp);
      void rememberBankApp(storage, nextApp.appId);
    },
    [storage],
  );

  return { app, remember };
}
