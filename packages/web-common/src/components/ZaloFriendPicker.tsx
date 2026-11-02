import { useState } from 'react';
import { findSimilarNames, type PersonView } from '@fsl/core';
import { usePlatform, type ZaloFriend } from '../platform';
import { useT } from '../i18n';
import { apiSend, ApiClientError } from '../api/client';
import { Button } from './Button';
import { Icon } from './icons';
import { Sheet } from './Sheet';
import { Avatar } from './Avatar';
import { InlineError } from './InlineError';

export type ZaloFriendPickerProps =
  | {
      mode: 'group';
      tripId: string;
      people: PersonView[];
      onDone: () => void;
    }
  | {
      mode: 'create';
      onPicked: (friends: ZaloFriend[]) => void;
    };

interface MatchItem {
  friend: ZaloFriend;
  match: { id: string; name: string };
}

export function ZaloFriendPicker(props: ZaloFriendPickerProps) {
  const platform = usePlatform();
  const t = useT();

  const [busy, setBusy] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [alreadyIn, setAlreadyIn] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [matches, setMatches] = useState<MatchItem[]>([]);

  if (platform.kind !== 'zmp') {
    return null;
  }

  const is409 = (err: unknown): boolean =>
    (err instanceof ApiClientError && err.status === 409) ||
    (typeof err === 'object' && err !== null && 'status' in err && (err as { status: unknown }).status === 409);

  const handleClick = async () => {
    if (busy) return;
    setAlreadyIn([]);
    setErrors([]);

    const friends = await platform.pickZaloFriends(20);
    if (!friends || friends.length === 0) return;

    if (props.mode === 'create') {
      props.onPicked(friends);
      return;
    }

    const candidates = props.people.filter(
      (p) => p.status !== 'left' && !p.isMember && p.zaloLinked !== true,
    );

    const matchesList: MatchItem[] = [];
    const directAddList: ZaloFriend[] = [];

    for (const friend of friends) {
      const match = findSimilarNames(friend.name, candidates)[0];
      if (match) {
        matchesList.push({ friend, match: { id: match.id, name: match.name } });
      } else {
        directAddList.push(friend);
      }
    }

    if (matchesList.length > 0) {
      setMatches(matchesList);
    }

    if (directAddList.length > 0) {
      setBusy(true);
      for (const friend of directAddList) {
        try {
          await apiSend(
            `/api/trips/${props.tripId}/people`,
            'POST',
            { name: friend.name, zaloSub: friend.zaloId },
            props.tripId,
          );
          props.onDone();
        } catch (err) {
          if (is409(err)) {
            setAlreadyIn((prev) => [...prev, friend.name]);
          } else {
            setErrors((prev) => [...prev, friend.name]);
          }
        }
      }
      setBusy(false);
    }
  };

  const handleLink = async (item: MatchItem) => {
    if (props.mode !== 'group' || rowBusyId) return;
    setRowBusyId(item.friend.zaloId);
    try {
      await apiSend(
        `/api/trips/${props.tripId}/people/${item.match.id}`,
        'PATCH',
        { zaloSub: item.friend.zaloId },
        props.tripId,
      );
      setMatches((prev) => prev.filter((m) => m.friend.zaloId !== item.friend.zaloId));
      props.onDone();
    } catch (err) {
      if (is409(err)) {
        setAlreadyIn((prev) => [...prev, item.friend.name]);
        setMatches((prev) => prev.filter((m) => m.friend.zaloId !== item.friend.zaloId));
      } else {
        setErrors((prev) => [...prev, item.friend.name]);
      }
    } finally {
      setRowBusyId(null);
    }
  };

  const handleAdd = async (item: MatchItem) => {
    if (props.mode !== 'group' || rowBusyId) return;
    setRowBusyId(item.friend.zaloId);
    try {
      await apiSend(
        `/api/trips/${props.tripId}/people`,
        'POST',
        { name: item.friend.name, zaloSub: item.friend.zaloId },
        props.tripId,
      );
      setMatches((prev) => prev.filter((m) => m.friend.zaloId !== item.friend.zaloId));
      props.onDone();
    } catch (err) {
      if (is409(err)) {
        setAlreadyIn((prev) => [...prev, item.friend.name]);
        setMatches((prev) => prev.filter((m) => m.friend.zaloId !== item.friend.zaloId));
      } else {
        setErrors((prev) => [...prev, item.friend.name]);
      }
    } finally {
      setRowBusyId(null);
    }
  };

  return (
    <div className="fsl-zalo-friends-wrap flex flex-col gap-2">
      <Button
        variant="secondary"
        className="fsl-zalo-friends"
        onClick={() => void handleClick()}
        disabled={busy}
        loading={busy}
      >
        <Icon name="users" />
        <span>{t('zaloFriends.button')}</span>
      </Button>

      {alreadyIn.map((name, index) => (
        <p
          key={`already-${name}-${index}`}
          className="fsl-zalo-friends__already m-0 text-sm leading-snug text-muted-foreground"
          role="status"
        >
          {t('zaloFriends.alreadyIn', { name })}
        </p>
      ))}

      {errors.map((name, index) => (
        <InlineError
          key={`error-${name}-${index}`}
          error={{ code: 'VALIDATION', message: t('zaloFriends.failed', { name }) }}
        />
      ))}

      {props.mode === 'group' && (
        <Sheet
          open={matches.length > 0}
          onClose={() => setMatches([])}
          title={t('zaloFriends.matchTitle')}
          className="fsl-zalo-friends__sheet"
        >
          <div className="flex flex-col gap-3 py-2">
            {matches.map((item) => (
              <div
                key={item.friend.zaloId}
                className="fsl-zalo-friends__match flex flex-col gap-3 py-3 border-b border-border last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={item.friend.name} avatarUrl={item.friend.avatar} />
                  <span className="text-base text-foreground font-medium">
                    {t('zaloFriends.linkTo', {
                      friend: item.friend.name,
                      person: item.match.name,
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    className="fsl-zalo-friends__link flex-1"
                    onClick={() => void handleLink(item)}
                    disabled={rowBusyId === item.friend.zaloId}
                    loading={rowBusyId === item.friend.zaloId}
                  >
                    {t('zaloFriends.link', { person: item.match.name })}
                  </Button>
                  <Button
                    variant="secondary"
                    className="fsl-zalo-friends__add flex-1"
                    onClick={() => void handleAdd(item)}
                    disabled={rowBusyId === item.friend.zaloId}
                  >
                    {t('zaloFriends.addNew')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}
