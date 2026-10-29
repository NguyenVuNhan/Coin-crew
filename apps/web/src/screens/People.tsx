import { useId, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { formatVnd, type Gender, type PersonView } from '@fsl/core';
import { useT } from '../i18n';
import { useTripView } from '../api/hooks';
import { ApiClientError } from '../api/client';
import { useTripAction } from '../lib/useTripAction';
import { personActions } from '../lib/rowActions';
import { SwipeGroupProvider } from '../lib/useSwipeReveal';
import { Screen } from '../components/Screen';
import { Avatar } from '../components/Avatar';
import { Pill } from '../components/Pill';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { ActionRow } from '../components/ActionRow';
import { ActionSheet } from '../components/ActionSheet';
import { SkeletonList } from '../components/Skeleton';
import { InlineError } from '../components/InlineError';
import { GenderToggle } from '../components/GenderToggle';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function People() {
  const { tripId } = useParams<{ tripId: string }>();
  const t = useT();
  const navigate = useNavigate();
  const leftHeadingId = useId();

  // Polls like the trip page: someone may be removed, leave or join from another phone while this list is open.
  const { view, error: loadError, isLoading, refetch } = useTripView(tripId ?? '', 20000, { stopAfterMs: 15 * 60_000 });
  const { busy, error, run } = useTripAction(tripId ?? '');

  const [mergeSource, setMergeSource] = useState<PersonView | null>(null);
  const [menuFor, setMenuFor] = useState<PersonView | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newGender, setNewGender] = useState<Gender | null>(null);

  if (isLoading) {
    return (
      <Screen title={t('people.title')} back={`/t/${tripId}/settings`}>
        <div className={cn('fsl-people flex flex-col gap-4 py-4')}>
          <SkeletonList rows={4} />
        </div>
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen title={t('people.title')} back={`/t/${tripId}/settings`}>
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
      onBank: () => navigate(`/t/${tripId}/people/${person.id}/bank`),
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

  const handleAddPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed || busy) return;
    setActingId('new-person');
    const payload: { name: string; gender?: Gender | null } = { name: trimmed };
    if (view.trip.preset === 'sport' && newGender) {
      payload.gender = newGender;
    }
    await run('/people', payload, 'POST');
    setNewName('');
    setNewGender(null);
  };

  const mainPeople = view.people.filter((p) => p.status !== 'left');
  const leftPeople = view.people.filter((p) => p.status === 'left');

  return (
    <Screen title={t('people.title')} back={`/t/${tripId}/settings`}>
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
              const isSport = view.trip.preset === 'sport';
              const canEditGender =
                isSport &&
                !view.trip.archived &&
                (view.me.kind === 'member' ||
                  (view.me.kind === 'guest' &&
                    !view.me.participantPending &&
                    person.id === view.me.participantId));

              let trailing: React.ReactNode = undefined;
              if (canEditGender) {
                trailing = (
                  <GenderToggle
                    name={person.name}
                    value={person.gender}
                    onChange={(next) =>
                      void run(`/people/${person.id}`, { gender: next }, 'PATCH')
                    }
                    disabled={busy}
                  />
                );
              } else if (person.gender) {
                trailing = (
                  <Pill tone={person.gender === 'M' ? 'accent' : 'warning'} className="shrink-0">
                    {t(`gender.${person.gender}`)}
                  </Pill>
                );
              }

              return (
                <li key={person.id} className="fsl-people__item">
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
                    <li key={person.id} className="fsl-people__item">
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

        {!view.trip.archived &&
          view.me.kind === 'member' &&
          (view.me.isAdmin || view.me.isOrganiser) && (
          <form onSubmit={handleAddPerson} className={cn('fsl-people__add-form flex items-center gap-2 mt-2')}>
            <Input
              type="text"
              className={cn('fsl-input flex-1')}
              placeholder={t('create.otherPlaceholder')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={40}
              aria-label={t('create.otherPlaceholder')}
            />
            {view.trip.preset === 'sport' && (
              <GenderToggle
                name={newName.trim() || t('create.otherPlaceholder')}
                value={newGender}
                onChange={setNewGender}
                disabled={busy}
              />
            )}
            <Button type="submit" variant="secondary" disabled={!newName.trim() || busy}>
              {t('create.addPerson')}
            </Button>
          </form>
        )}
        {actingId === 'new-person' && Boolean(error) && (
          <p className={cn('fsl-people__row-error m-0 px-4 pb-3 pt-0 text-xs font-medium text-danger')} role="alert">
            {actionErrorText(error)}
          </p>
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
