import { useState } from 'react';
import { useParams } from 'react-router';
import type { PersonView } from '@fsl/core';
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
import './People.css';

export function People() {
  const { tripId } = useParams<{ tripId: string }>();
  const t = useT();

  const { view, error: loadError, isLoading, refetch } = useTripView(tripId ?? '', 0);
  const { busy, error, run } = useTripAction(tripId ?? '');

  const [mergeSource, setMergeSource] = useState<PersonView | null>(null);
  const [menuFor, setMenuFor] = useState<PersonView | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Screen title={t('people.title')} back={`/t/${tripId}/settings`}>
        <div className="fsl-people">
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
    setActingId(person.id);
    await run(`/people/${person.id}`, undefined, 'DELETE');
  };

  /** A person who is in an expense or payment cannot be removed: the API says 409, and merging is the way. */
  const actionErrorText = (err: unknown) =>
    err instanceof ApiClientError && err.status === 409 ? t('people.useMerge') : (err as Error).message || t('error.generic');

  const actionsFor = (person: PersonView) =>
    personActions(view, person, {
      t,
      onMerge: () => setMergeSource(person),
      onRemove: () => {
        void remove(person);
      },
    });

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

  return (
    <Screen title={t('people.title')} back={`/t/${tripId}/settings`}>
      <div className="fsl-people">
        <SwipeGroupProvider>
          <ul className="fsl-people__list">
            {view.people.map((person, index) => {
              const actions = actionsFor(person);
              const isOrganiser =
                person.isOrganiser === true ||
                (view.me.isOrganiser && person.id === view.me.participantId);
              const roleText = isOrganiser
                ? t('people.organiser')
                : person.isMember
                  ? t('people.member')
                  : t('people.guest');
              const roleTone = isOrganiser ? 'accent' : 'neutral';
              const hasRowError = actingId === person.id && Boolean(error);

              return (
                <li key={person.id} className="fsl-people__item">
                  <ActionRow
                    label={`${person.name}, ${roleText}`}
                    actions={actions}
                    onOpen={actions.length > 0 ? () => setMenuFor(person) : undefined}
                    hintable={index === 0}
                    leading={<Avatar name={person.name} />}
                  >
                    <span className="fsl-people__name">{person.name}</span>
                    <Pill tone={roleTone}>{roleText}</Pill>
                    {person.status === 'pending' && (
                      <Pill tone="warning">{t('who.pending')}</Pill>
                    )}
                  </ActionRow>
                  {hasRowError && (
                    <p className="fsl-people__row-error" role="alert">
                      {actionErrorText(error)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </SwipeGroupProvider>

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
          <p className="fsl-people__explain">{t('people.mergeExplain')}</p>
          <div className="fsl-people__targets">
            {mergeSource &&
              view.people
                .filter((p) => p.id !== mergeSource.id)
                .map((target) => (
                  <Button
                    key={target.id}
                    variant="secondary"
                    block
                    className="fsl-people__target"
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
