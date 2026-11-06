import { useEffect } from 'react';
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
  const me = useMe();
  const group = useGroupTheme();

  // `data` outlives a failed refetch, so "answered" means the last successful answer.
  const answered = me.data !== undefined;
  const fetchedTheme = me.data?.user?.theme;
  const fetched = isThemeId(fetchedTheme) ? fetchedTheme : null;
  const personal = answered ? fetched : readCachedTheme();

  useEffect(() => {
    applyTheme(resolveTheme({ personal, group }));
  }, [personal, group]);

  useEffect(() => {
    if (answered) cacheTheme(fetched);
  }, [answered, fetched]);

  return null;
}
