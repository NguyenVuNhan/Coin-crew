import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { usePlatform } from './index';
import { lookupZaloChat } from '../api/zaloChats';

let hasRunChatRoute = false;

// While the chat lookup runs, Landing holds its own redirect to /trips; otherwise the two navigations race and
// the later one (often Landing's) wins.
let pending = false;
const listeners = new Set<() => void>();
function setPending(value: boolean): void {
  pending = value;
  listeners.forEach((l) => l());
}

/** True while the start-up chat lookup is still running. */
export function useChatRoutePending(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pending,
    () => false,
  );
}

export function resetChatRouteForTests(): void {
  hasRunChatRoute = false;
  pending = false;
}

export function useChatRoute(): { sheetChatId: string | null; closeSheet(): void } {
  const [sheetChatId, setSheetChatId] = useState<string | null>(null);
  const platform = usePlatform();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [target, setTarget] = useState<string | null>(null);

  // The navigation has committed: Landing is gone, so it may redirect again on a later visit to /.
  useEffect(() => {
    if (target !== null && pathname === target) {
      setTarget(null);
      setPending(false);
    }
  }, [pathname, target]);

  // Mark the lookup as pending during the first render: App renders before Landing, but Landing's effect would run
  // before App's, so setting it in the effect would be too late.
  if (!hasRunChatRoute && platform.kind === 'zmp') {
    pending = true;
  }

  const closeSheet = useCallback(() => {
    setSheetChatId(null);
  }, []);

  useEffect(() => {
    if (hasRunChatRoute) return;
    if (platform.kind !== 'zmp') return;
    hasRunChatRoute = true;

    (async () => {
      try {
        const ctx = await platform.chatContext();
        if (!ctx || ctx.type !== 'group') {
          setPending(false);
          return;
        }
        const lookup = await lookupZaloChat(ctx.id);
        if (lookup.linked) {
          // Pending stays true: React Router applies navigations as a transition, so clearing it here would let
          // Landing's urgent redirect to /trips land first and win. The effect above clears it once we're there.
          const to = lookup.isMember ? `/t/${lookup.tripId}` : `/j/${lookup.joinToken}`;
          setTarget(to);
          navigate(to, { replace: true });
          return;
        }
        setSheetChatId(ctx.id);
        setPending(false);
      } catch {
        // A failed lookup does nothing (no error UI).
        setPending(false);
      }
    })();
  }, [platform, navigate]);

  return { sheetChatId, closeSheet };
}
