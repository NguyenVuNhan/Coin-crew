import type { QueryClient } from '@tanstack/react-query';
import type { PlatformBridge } from '@cc/web-platform';
import { sessionStore } from '@cc/web-platform/session';
import { linkTokens } from '@cc/web-util/linkTokens';
import { cacheTheme } from '@cc/web-util/themeCache';
import { apiSend } from './client';

/** Set in the Mini App's storage by "Sign out", so the next start doesn't silently sign the person back in. */
export const SIGNED_OUT_KEY = 'signedOut';

/**
 * Sign out and make this phone forget the person: the session, this device's id, the saved group links, the cached theme and every
 * cached answer. Throws when the API call fails; nothing is forgotten then, so the person can try again.
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
    await platform.storage.remove('zaloName');
  } finally {
    queryClient.clear();
  }
}
