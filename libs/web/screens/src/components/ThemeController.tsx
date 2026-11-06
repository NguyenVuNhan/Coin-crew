import { useCallback, useEffect, useLayoutEffect, useSyncExternalStore } from 'react';
import { notifyManager, useQueryClient } from '@tanstack/react-query';
import { isThemeId, resolveTheme } from '@cc/core';
import { useMe } from '@cc/web-data-access/hooks';
import { applyTheme, cacheTheme, readCachedTheme } from '@cc/web-ui/lib/theme';
import { useGroupTheme } from '../lib/groupTheme';

/**
 * Puts the theme in view on `<html>` (so sheets and other portals follow): the group's colours inside a group,
 * else the signed-in person's own theme, else Jade. Until `/api/me` answers, the theme cached on this device stands
 * in for the person's; each answer refreshes that cache, and a failed fetch leaves it alone.
 */
export function ThemeController(): null {
  const queryClient = useQueryClient();
  const me = useMe();
  const group = useGroupTheme();

  // This sits beside the routes and rarely re-renders, and `queryClient.clear()` (sign-out) drops the `['me']` query
  // without telling its observers. Re-rendering whenever that query leaves or re-enters the cache lets `useMe` bind
  // to the new one, so the next answer (signed out, or the next person) reaches the screen. Batched like TanStack's
  // own cache hooks, so a `['me']` query built while another component renders doesn't update this one mid-render.
  const subscribeToMeQuery = useCallback(
    (onChange: () => void) => {
      const notify = notifyManager.batchCalls(onChange);
      return queryClient.getQueryCache().subscribe((event) => {
        if (event.query.queryKey[0] === 'me') notify();
      });
    },
    [queryClient],
  );
  useSyncExternalStore(subscribeToMeQuery, () => queryClient.getQueryCache().find({ queryKey: ['me'], exact: true }));

  // `data` outlives a failed refetch, so "answered" means the last successful answer.
  const answered = me.data !== undefined;
  const fetchedTheme = me.data?.user?.theme;
  const fetched = isThemeId(fetchedTheme) ? fetchedTheme : null;
  const personal = answered ? fetched : readCachedTheme();

  // A layout effect, so the new colours are on `<html>` before the browser paints the content that brought them.
  useLayoutEffect(() => {
    applyTheme(resolveTheme({ personal, group }));
  }, [personal, group]);

  useEffect(() => {
    if (answered) cacheTheme(fetched);
  }, [answered, fetched]);

  return null;
}
