import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { TripListItem } from '@fsl/core';
import { useT } from '../i18n';
import { useMe } from '../api/hooks';
import { apiFetch } from '../api/client';
import { linkZaloChat } from '../api/zaloChats';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { InlineError } from './InlineError';
import { Skeleton } from './Skeleton';
import { ZaloSignIn } from './ZaloSignIn';

export interface LinkChatSheetProps {
  chatId: string | null;
  onClose: () => void;
}

export function LinkChatSheet({ chatId, onClose }: LinkChatSheetProps) {
  const t = useT();
  const navigate = useNavigate();
  const meQuery = useMe();
  const isGuest = meQuery.data?.user === null;

  const tripsQuery = useQuery<TripListItem[]>({
    queryKey: ['trips'],
    queryFn: () => apiFetch<TripListItem[]>('/api/trips'),
    enabled: meQuery.data?.user !== null && chatId !== null,
  });

  const [posting, setPosting] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [chatId]);

  const groups = (tripsQuery.data ?? []).filter(
    (trip) => !trip.archived && trip.preset !== 'direct',
  );

  async function handleLink(tripId: string) {
    if (!chatId || posting) return;
    setPosting(true);
    setHasError(false);
    try {
      await linkZaloChat(chatId, tripId);
      navigate(`/t/${tripId}`);
      onClose();
    } catch {
      setHasError(true);
    } finally {
      setPosting(false);
    }
  }

  const isLoading = meQuery.isLoading || (!isGuest && tripsQuery.isLoading);

  return (
    <Sheet
      open={chatId !== null}
      onClose={onClose}
      title={t('zaloChat.linkTitle')}
      className="fsl-link-chat"
    >
      <div className="flex flex-col gap-4 py-2">
        {isGuest ? (
          <>
            <p className="m-0 text-sm leading-normal text-muted-foreground">
              {t('zaloChat.signInFirst')}
            </p>
            <ZaloSignIn />
          </>
        ) : (
          <>
            {isLoading ? (
              <div className="flex flex-col gap-2">
                <Skeleton height={52} radius="xl" className="h-[52px]" />
                <Skeleton height={52} radius="xl" className="h-[52px]" />
                <Skeleton height={52} radius="xl" className="h-[52px]" />
              </div>
            ) : groups.length === 0 ? (
              <p className="m-0 text-sm leading-normal text-muted-foreground">
                {t('zaloChat.noGroups')}
              </p>
            ) : (
              <div className="fsl-link-chat__list list-none m-0 p-0 bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
                {groups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    disabled={posting}
                    onClick={() => handleLink(group.id)}
                    className="fsl-link-chat__group w-full flex items-center justify-between gap-3 min-h-[52px] px-4 py-2 text-foreground font-medium text-base text-left bg-card hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50 transition-colors"
                  >
                    <span className="truncate">{group.name}</span>
                  </button>
                ))}
              </div>
            )}

            {hasError && (
              <InlineError
                error={{ code: 'VALIDATION', message: t('zaloChat.linkFailed') }}
              />
            )}

            <Button
              variant="primary"
              block
              className="fsl-link-chat__create"
              onClick={() => {
                if (chatId) {
                  navigate(`/trips/new?zaloChat=${encodeURIComponent(chatId)}`);
                  onClose();
                }
              }}
            >
              {t('zaloChat.createNew')}
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
}
