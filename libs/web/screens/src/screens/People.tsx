import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { findSimilarNames, formatVnd, type Gender, type NameCandidate, type PersonView, type TripView } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { useTrip } from '../lib/tripBase';
import { useTripView } from '@cc/web-data-access/hooks';
import { ApiClientError } from '@cc/web-data-access/client';
import { addTripPerson, removeTripPerson } from '@cc/web-data-access/tripPeople';
import { useTripAction } from '../lib/useTripAction';
import { personActions } from '../lib/rowActions';
import { SwipeGroupProvider } from '@cc/web-util/useSwipeReveal';
import { Screen } from '../components/Screen';
import { Avatar } from '@cc/web-ui/components/Avatar';
import { Pill } from '@cc/web-ui/components/Pill';
import { Button } from '@cc/web-ui/components/Button';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { ActionRow } from '@cc/web-ui/components/ActionRow';
import { ActionSheet } from '@cc/web-ui/components/ActionSheet';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { AddPeopleBar, type NewPerson } from '../components/AddPeopleBar';
import { GenderPill } from '../components/GenderPill';
import { showUndo } from '../components/UndoSnackbarHost';
import { cn } from '@cc/web-ui/lib/utils';
import { usePlatform } from '@cc/web-platform';
import { inviteCard } from '../lib/shareCards';
import { useBankFirst } from '../components/BankFirstSheet';
import { Icon } from '@cc/web-ui/components/icons';

function ZaloInviteButton({ view }: { view: TripView }) {
  const platform = usePlatform();
  const t = useT();
  const { guard, sheet } = useBankFirst(view);

  return (
    <>
      <Button
        variant="secondary"
        block
        className={cn('fsl-people__invite-zalo mt-2')}
        onClick={() =>
          guard(() => {
            void platform.share(inviteCard(view, platform.apiBase));
          })
        }
      >
        <Icon name="share" size={18} />
        {t('people.inviteZalo')}
      </Button>
      {sheet}
    </>
  );
}

export function People() {
  const { tripId, href } = useTrip();
  const t = useT();
  const platform = usePlatform();
  const navigate = useNavigate();
  const leftHeadingId = useId();

  // Polls like the trip page: someone may be removed, leave or join from another phone while this list is open.
  const { view, error: loadError, isLoading, refetch } = useTripView(tripId ?? '', 20000, { stopAfterMs: 15 * 60_000 });
  const { busy, error, run } = useTripAction(tripId ?? '');
  const queryClient = useQueryClient();

  const [mergeSource, setMergeSource] = useState<PersonView | null>(null);
  const [menuFor, setMenuFor] = useState<PersonView | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  /** Why the last add failed, shown above the add bar until the next add goes through. */
  const [addError, setAddError] = useState<string | null>(null);
  /** A just-added person whose name looks like someone already here: new id → the look-alike. Lives while the screen is open. */
  const [hints, setHints] = useState<Record<string, { id: string; name: string }>>({});
  /** Adds (and their Undo) reach the server one at a time, in the order they were made. */
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  /** The last added row, scrolled into view once it shows in the list. */
  const scrollTarget = useRef<string | null>(null);

  useEffect(() => {
    const id = scrollTarget.current;
    if (!id || !view?.people.some((p) => p.id === id)) return;
    scrollTarget.current = null;
    document.querySelector(`[data-person-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [view]);

  if (isLoading) {
    return (
      <Screen title={t('people.title')} back={href('/settings')}>
        <div className={cn('fsl-people flex flex-col gap-4 py-4')}>
          <SkeletonList rows={4} />
        </div>
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen title={t('people.title')} back={href('/settings')}>
        <InlineError error={loadError} onRetry={refetch} />
      </Screen>
    );
  }

  if (!view) {
    return null;
  }

  const remove = async (person: PersonView) => {
    if (busy) return;
    if (!window.confirm(t('people.removeConfirm', { name: person.name }))) return;
    setActingId(person.id);
    await run(`/people/${person.id}`, undefined, 'DELETE');
  };

  /** A refused action (e.g. removing someone not allowed) shows a plain message. */
  const actionErrorText = (err: unknown) =>
    err instanceof ApiClientError && err.status === 403
      ? t('people.cannotRemove')
      : (err as Error).message || t('error.generic');

  const makeAdmin = async (person: PersonView) => {
    if (busy) return;
    setActingId(person.id);
    await run(`/people/${person.id}/admin`, undefined, 'POST');
  };

  const removeAdmin = async (person: PersonView) => {
    if (busy) return;
    setActingId(person.id);
    await run(`/people/${person.id}/admin`, undefined, 'DELETE');
  };

  const restore = async (person: PersonView) => {
    if (busy) return;
    setActingId(person.id);
    await run(`/people/${person.id}/restore`, undefined, 'POST');
  };

  const actionsFor = (person: PersonView) =>
    personActions(view, person, {
      t,
      onMerge: () => setMergeSource(person),
      onRemove: () => {
        void remove(person);
      },
      onBank: () => navigate(href(`/people/${person.id}/bank`)),
      onMakeAdmin: () => {
        void makeAdmin(person);
      },
      onRemoveAdmin: () => {
        void removeAdmin(person);
      },
      onRestore: () => {
        void restore(person);
      },
    });

  /** A guest's bank details under their name; members manage their own, so they get none. */
  const bankLine = (person: PersonView): string | null => {
    if (person.isMember) return null;
    if (person.bankAccount) {
      const account = `${person.bankAccount.bankName} · ${person.bankAccount.accountNumberMasked}`;
      return person.bank === 'pending' ? `${account} · ${t('people.bankWaitingSuffix')}` : account;
    }
    return person.bank === 'pending' ? t('people.bankPending') : t('people.bankNone');
  };

  /** Your own row says so on its own line, which a long name can't push out: two look-alike names stay apart. */
  const isMe = (person: PersonView) => person.id === view.me.participantId;
  const subLine = (person: PersonView): string | null =>
    [isMe(person) ? t('trip.you') : null, bankLine(person)].filter((part) => part !== null).join(' · ') || null;

  const handleChooseTarget = async (target: PersonView) => {
    if (!mergeSource || busy) return;

    const confirmed = window.confirm(
      t('people.mergeConfirm', {
        from: mergeSource.name,
        into: target.name,
      }),
    );
    if (!confirmed) return;

    const sourceId = mergeSource.id;
    setMergeSource(null);
    setActingId(sourceId);
    await run('/people/merge', { fromId: sourceId, intoId: target.id });
  };

  const isSport = view.trip.preset === 'sport';
  const tid = tripId ?? '';

  const dropHints = (ids: string[]) =>
    setHints((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });

  /** Posts the people one by one; stops at the first failure and resolves with the people not added. */
  const sendPeople = async (people: NewPerson[], others: NameCandidate[]): Promise<NewPerson[]> => {
    const added: { id: string; name: string; gender: Gender | null }[] = [];
    const newHints: Record<string, { id: string; name: string }> = {};
    let notAdded: NewPerson[] = [];
    for (const [index, person] of people.entries()) {
      const input: { name: string; gender?: Gender } = { name: person.name };
      if (isSport && person.gender) input.gender = person.gender;
      let id: string;
      try {
        id = await addTripPerson(tid, input);
      } catch (err) {
        notAdded = people.slice(index);
        const names = notAdded.map((p) => p.name).join(', ');
        const why = (err as Error).message || t('error.generic');
        setAddError(`${t('people.addFailed', { names })} ${why}`);
        break;
      }
      setAddError(null);
      const [match] = findSimilarNames(person.name, others);
      if (match) newHints[id] = { id: match.id, name: match.name };
      others.push({ id, name: person.name });
      added.push({ id, name: person.name, gender: input.gender ?? null });
    }
    const last = added[added.length - 1];
    if (!last) return notAdded;

    setHints((prev) => ({ ...prev, ...newHints }));
    scrollTarget.current = last.id;
    await queryClient.invalidateQueries({ queryKey: ['trip', tid] });

    const ids = added.map((p) => p.id);
    const message =
      added.length > 1
        ? t('addBar.addedMany', { count: added.length })
        : last.gender
          ? t('addBar.addedWithGender', {
              name: last.name,
              gender: t(last.gender === 'M' ? 'gender.pillM' : 'gender.pillF'),
            })
          : t('addBar.added', { name: last.name });
    showUndo({
      message,
      actionLabel: t('common.undo'),
      onAction: () => {
        const undo = queue.current.then(async () => {
          try {
            for (const id of ids) await removeTripPerson(tid, id);
          } catch (err) {
            setAddError((err as Error).message || t('error.generic'));
          }
          await queryClient.invalidateQueries({ queryKey: ['trip', tid] });
          dropHints(ids);
        });
        queue.current = undo.catch(() => undefined);
      },
    });
    return notAdded;
  };

  /** The add bar's adds, chained so back-to-back adds reach the server one at a time, in order. */
  const addPeople = (people: NewPerson[]): Promise<NewPerson[]> => {
    // Look-alikes are checked against the group as it is now, plus those added earlier in the same batch.
    const others: NameCandidate[] = view.people
      .filter((p) => p.status !== 'left')
      .map((p) => ({ id: p.id, name: p.name }));
    const job = queue.current.then(() => sendPeople(people, others));
    queue.current = job.catch(() => undefined);
    return job;
  };

  const mergeIntoLookAlike = async (person: PersonView, match: { id: string; name: string }) => {
    if (busy) return;
    if (!window.confirm(t('people.mergeConfirm', { from: person.name, into: match.name }))) return;
    setActingId(person.id);
    await run('/people/merge', { fromId: person.id, intoId: match.id });
    dropHints([person.id]);
  };

  const changeGender = async (person: PersonView, next: Gender) => {
    const previous = person.gender ?? null;
    setActingId(person.id);
    if (!(await run(`/people/${person.id}`, { gender: next }, 'PATCH'))) return;
    showUndo({
      message: t('gender.changed', {
        name: person.name,
        gender: t(next === 'M' ? 'gender.pillM' : 'gender.pillF'),
      }),
      actionLabel: t('common.undo'),
      onAction: () => {
        setActingId(person.id);
        void run(`/people/${person.id}`, { gender: previous }, 'PATCH');
      },
    });
  };

  const canAdd =
    !view.trip.archived && view.me.kind === 'member' && (view.me.isAdmin === true || view.me.isOrganiser);

  const mainPeople = view.people.filter((p) => p.status !== 'left');
  const leftPeople = view.people.filter((p) => p.status === 'left');

  return (
    <Screen
      title={t('people.title')}
      back={href('/settings')}
      barAboveKeyboard={canAdd}
      bottomBar={
        canAdd ? (
          <>
            {addError && (
              <p role="alert" className="fsl-people__add-error m-0 text-sm text-danger">
                {addError}
              </p>
            )}
            <AddPeopleBar sport={isSport} onAdd={addPeople} />
          </>
        ) : undefined
      }
    >
      <div className={cn('fsl-people flex flex-col gap-4 py-4')}>
        <SwipeGroupProvider>
          <ul className={cn('fsl-people__list list-none m-0 p-0 bg-card border border-border rounded-xl overflow-hidden divide-y divide-border [&_.fsl-action-row]:border-b-0 [&_.fsl-action-row__main]:pl-3 [&_.fsl-action-row__main]:gap-2 [&_.fsl-pill]:shrink-0')}>
            {mainPeople.map((person, index) => {
              const actions = actionsFor(person);
              const isOrganiser =
                person.isOrganiser === true ||
                (view.me.isOrganiser && person.id === view.me.participantId);
              const isAdmin = person.isAdmin === true;
              const roleText = isOrganiser
                ? t('people.organiser')
                : isAdmin
                  ? t('people.adminBadge')
                  : person.isMember
                    ? t('people.member')
                    : t('people.guest');
              const roleTone = isOrganiser || isAdmin ? 'accent' : 'neutral';
              const hasRowError = actingId === person.id && Boolean(error);
              const genderEditable =
                !view.trip.archived &&
                view.me.kind === 'member' &&
                (view.me.isAdmin === true || view.me.isOrganiser || person.id === view.me.participantId);
              const trailing: ReactNode = isSport ? (
                <GenderPill
                  name={person.name}
                  value={person.gender ?? null}
                  editable={genderEditable}
                  onChange={(next) => void changeGender(person, next)}
                  disabled={busy}
                />
              ) : undefined;
              const hint = hints[person.id];

              return (
                <li key={person.id} className="fsl-people__item" data-person-id={person.id}>
                  <ActionRow
                    label={`${person.name}, ${roleText}${isMe(person) ? `, ${t('trip.you')}` : ''}`}
                    actions={actions}
                    onOpen={actions.length > 0 ? () => setMenuFor(person) : undefined}
                    hintable={index === 0}
                    leading={<Avatar name={person.name} avatarUrl={person.avatarUrl} />}
                    trailing={trailing}
                  >
                    <span className={cn('fsl-people__text flex-1 min-w-0 flex flex-col')}>
                      <span className={cn('fsl-people__name flex-1 min-w-0 truncate text-base font-semibold text-foreground')}>{person.name}</span>
                      {subLine(person) !== null && <span className={cn('fsl-people__bank text-sm leading-snug text-muted-foreground tabular-nums [overflow-wrap:anywhere]')}>{subLine(person)}</span>}
                    </span>
                    <Pill tone={roleTone} className="shrink-0">{roleText}</Pill>
                    {person.status === 'pending' && (
                      <Pill tone="warning" className="shrink-0">{t('who.pending')}</Pill>
                    )}
                  </ActionRow>
                  {hasRowError && (
                    <p className={cn('fsl-people__row-error m-0 px-4 pb-3 pt-0 text-xs font-medium text-danger')} role="alert">
                      {actionErrorText(error)}
                    </p>
                  )}
                  {hint && (
                    <div className={cn('fsl-people__like flex items-center gap-2 px-4 pb-3 text-sm text-muted-foreground')}>
                      <span className="min-w-0 flex-1">{t('people.likeHint', { name: hint.name })}</span>
                      <Button
                        variant="ghost"
                        className="shrink-0"
                        disabled={busy}
                        onClick={() => void mergeIntoLookAlike(person, hint)}
                      >
                        {t('people.likeMerge')}
                      </Button>
                      <button
                        type="button"
                        aria-label={t('people.likeDismiss')}
                        className={cn('fsl-people__like-dismiss inline-flex shrink-0 items-center justify-center size-11 rounded-full bg-transparent border-0 cursor-pointer text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 ring-ring')}
                        onClick={() => dropHints([person.id])}
                      >
                        <Icon name="x" size={18} />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </SwipeGroupProvider>

        {leftPeople.length > 0 && (
          <section className={cn('fsl-people__left flex flex-col gap-2')} aria-labelledby={leftHeadingId}>
            <h2 id={leftHeadingId} className={cn('fsl-people__left-title m-0 px-1 text-sm font-semibold text-muted-foreground')}>
              {t('people.leftTitle')}
            </h2>
            <SwipeGroupProvider>
              <ul className={cn('fsl-people__list list-none m-0 p-0 bg-card border border-border rounded-xl overflow-hidden divide-y divide-border [&_.fsl-action-row]:border-b-0 [&_.fsl-action-row__main]:pl-3 [&_.fsl-action-row__main]:gap-2 [&_.fsl-pill]:shrink-0')}>
                {leftPeople.map((person) => {
                  const actions = actionsFor(person);
                  const hasRowError = actingId === person.id && Boolean(error);
                  const b = view.balances[person.id] ?? 0;
                  const balanceLine =
                    b < 0
                      ? t('people.leftOwes', { amount: formatVnd(-b) })
                      : b > 0
                        ? t('people.leftOwed', { amount: formatVnd(b) })
                        : t('people.leftSettled');

                  return (
                    <li key={person.id} className="fsl-people__item" data-person-id={person.id}>
                      <ActionRow
                        label={`${person.name}, ${t('people.leftBadge')}`}
                        actions={actions}
                        onOpen={actions.length > 0 ? () => setMenuFor(person) : undefined}
                        hintable={false}
                        leading={<Avatar name={person.name} avatarUrl={person.avatarUrl} />}
                      >
                        <span className={cn('fsl-people__text flex-1 min-w-0 flex flex-col')}>
                          <span className={cn('fsl-people__name flex-1 min-w-0 truncate text-base font-semibold text-foreground')}>{person.name}</span>
                          <span className={cn('fsl-people__bank text-sm leading-snug text-muted-foreground tabular-nums [overflow-wrap:anywhere]')}>{balanceLine}</span>
                        </span>
                        <Pill tone="neutral" className="shrink-0">{t('people.leftBadge')}</Pill>
                      </ActionRow>
                      {hasRowError && (
                        <p className={cn('fsl-people__row-error m-0 px-4 pb-3 pt-0 text-xs font-medium text-danger')} role="alert">
                          {actionErrorText(error)}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </SwipeGroupProvider>
          </section>
        )}

        {platform.kind === 'zmp' && !view.trip.archived && view.links !== null && (
          // Inside Zalo, adding friends means forwarding the invite: Zalo's share sheet picks the person or group chat.
          <ZaloInviteButton view={view} />
        )}

        <ActionSheet
          open={menuFor !== null}
          onClose={() => setMenuFor(null)}
          title={menuFor?.name ?? ''}
          actions={menuFor ? actionsFor(menuFor) : []}
        />

        <Sheet
          open={mergeSource !== null}
          onClose={() => setMergeSource(null)}
          title={
            mergeSource ? t('people.mergeInto', { name: mergeSource.name }) : ''
          }
        >
          <p className={cn('fsl-people__explain m-0 mb-3 text-sm leading-snug text-muted-foreground')}>{t('people.mergeExplain')}</p>
          <div className={cn('fsl-people__targets flex flex-col gap-2 py-2')}>
            {mergeSource &&
              view.people
                .filter((p) => p.id !== mergeSource.id && p.status !== 'left')
                .map((target) => (
                  <Button
                    key={target.id}
                    variant="secondary"
                    block
                    className={cn('fsl-people__target')}
                    onClick={() => handleChooseTarget(target)}
                  >
                    {target.name}
                  </Button>
                ))}
          </div>
        </Sheet>
      </div>
    </Screen>
  );
}
