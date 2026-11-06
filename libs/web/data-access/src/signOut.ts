import type { QueryClient } from '@tanstack/react-query';
import type { PlatformBridge } from '@cc/web-platform';
import { sessionStore } from '@cc/web-platform/session';
import { linkTokens } from '@cc/web-util/linkTokens';
import { cacheTheme } from '@cc/web-util/themeCache';
import { apiSend } from './client';

/** Set in the Mini App's storage by "Sign out", so the next start doesn't silently sign the person back in. */
export const SIGNED_OUT_KEY = 'signedOut';

/**
 * Choices this phone keeps per group for whoever is signed in: "Share anyway" before the bank-details prompt
 * (`cc.bankFirst.skip.<tripId>`, screens' `bankFirst.ts`) and the transaction updates already seen
 * (`fsl_seen_tx_updates_<tripId>`, `UpdatedTransactionsBanner`). The next person on a shared phone starts fresh.
 */
const PER_GROUP_KEY_PREFIXES = ['cc.bankFirst.skip.', 'fsl_seen_tx_updates_'];

function forgetPerGroupChoices(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null && PER_GROUP_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // No storage (private mode, blocked): nothing to forget.
  }
}

/**
 * Sign out and make this phone forget the person: the session, this device's id, the saved group links, the cached
 * theme, the per-group choices and every cached answer. Throws when the API call fails; nothing is forgotten then, so
 * the person can try again.
 */
export async function signOut(platform: PlatformBridge, queryClient: QueryClient): Promise<void> {
  await apiSend<void>('/api/auth/logout', 'POST');
  try {
    if (platform.kind === 'zmp') {
      await platform.storage.set(SIGNED_OUT_KEY, '1');
    }
    await sessionStore.setToken(null);
    await sessionStore.clearDeviceId();
    linkTokens.clearAll();
    cacheTheme(null);
    forgetPerGroupChoices();
    await platform.storage.remove('zaloName');
  } finally {
    queryClient.clear();
  }
}
