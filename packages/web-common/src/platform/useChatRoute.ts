import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { usePlatform } from './index';
import { lookupZaloChat } from '../api/zaloChats';

let hasRunChatRoute = false;

export function resetChatRouteForTests(): void {
  hasRunChatRoute = false;
}

export function useChatRoute(): { sheetChatId: string | null; closeSheet(): void } {
  const [sheetChatId, setSheetChatId] = useState<string | null>(null);
  const platform = usePlatform();
  const navigate = useNavigate();

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
        if (!ctx || ctx.type !== 'group') return;
        const lookup = await lookupZaloChat(ctx.id);
        if (lookup.linked) {
          if (lookup.isMember) {
            navigate(`/t/${lookup.tripId}`, { replace: true });
          } else {
            navigate(`/j/${lookup.joinToken}`, { replace: true });
          }
        } else {
          setSheetChatId(ctx.id);
        }
      } catch {
        // A failed lookup does nothing (no error UI).
      }
    })();
  }, [platform, navigate]);

  return { sheetChatId, closeSheet };
}
