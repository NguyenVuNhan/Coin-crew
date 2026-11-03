import type { QueryClient } from '@tanstack/react-query';
import type { ZaloMiniRequest, ZaloMiniResponse } from '@cc/core';
import { apiSend } from './client';
import type { PlatformBridge } from '@cc/web-platform';
import { sessionStore } from '@cc/web-platform/session';

const ENDPOINT = '/api/auth/zalo-mini';

/**
 * Silent Zalo recognition at boot: a known Zalo user gets a session token, anyone else a
 * Zalo-bound device ID. Never throws; a failure leaves the app an anonymous guest.
 */
export async function zaloHandshake(p: PlatformBridge): Promise<'signed_in' | 'guest' | 'skipped'> {
  if (p.kind !== 'zmp') return 'skipped';
  try {
    const accessToken = await p.zaloAccessToken();
    if (!accessToken) return 'skipped';
    const body: ZaloMiniRequest = { accessToken };
    const res = await apiSend<ZaloMiniResponse>(ENDPOINT, 'POST', body);
    if (res?.status === 'signed_in') {
      await sessionStore.setToken(res.sessionToken);
      return 'signed_in';
    }
    if (res?.status === 'guest') {
      if (sessionStore.token() !== null) await sessionStore.setToken(null);
      await sessionStore.setDeviceId(res.deviceId);
    }
    return 'guest';
  } catch {
    return 'guest';
  }
}

/** "Continue with your Zalo account": asks Zalo for name and photo, then creates or signs in the account. */
export async function zaloSignIn(
  p: PlatformBridge,
  queryClient: QueryClient,
): Promise<'signed_in' | 'declined' | 'failed'> {
  try {
    const info = await p.zaloUserInfo();
    if (info === 'declined') return 'declined';
    if (!info) return 'failed';
    const accessToken = await p.zaloAccessToken();
    if (!accessToken) return 'failed';
    const body: ZaloMiniRequest = {
      accessToken,
      consent: true,
      profile: { name: info.name, avatar: info.avatar || null },
    };
    const res = await apiSend<ZaloMiniResponse>(ENDPOINT, 'POST', body);
    if (res?.status !== 'signed_in') return 'failed';
    await sessionStore.setToken(res.sessionToken);
    try {
      await p.storage.set('zaloName', info.name);
    } catch {
      // Only a hint for WhoAreYou; signing in already worked.
    }
    // Signing in can turn Zalo-tied slots into memberships anywhere, so refetch everything.
    void queryClient.invalidateQueries();
    return 'signed_in';
  } catch {
    return 'failed';
  }
}
