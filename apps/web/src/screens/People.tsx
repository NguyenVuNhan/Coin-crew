import { useState } from 'react';
import { useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { PersonView } from '@fsl/core';
import { useT } from '../i18n';
import { useTripView } from '../api/hooks';
import { apiSend, ApiClientError } from '../api/client';
import { Screen } from '../components/Screen';
import { Avatar } from '../components/Avatar';
import { Pill } from '../components/Pill';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { SkeletonList } from '../components/Skeleton';
import { InlineError } from '../components/InlineError';
import './People.css';

export function People() {
  const { tripId } = useParams<{ tripId: string }>();
  const queryClient = useQueryClient();
  const t = useT();

  const { view, error, isLoading, refetch } = useTripView(tripId ?? '', 0);

  const [mergeSource, setMergeSource] = useState<PersonView | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  if (isLoading) {
    return (
      <Screen title={t('people.title')} back={`/t/${tripId}/settings`}>
        <div className="fsl-people">
          <SkeletonList rows={4} />
        </div>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title={t('people.title')} back={`/t/${tripId}/settings`}>
        <InlineError error={error} onRetry={refetch} />
      </Screen>
    );
  }

  if (!view) {
    return null;
  }

  const handleRemove = async (person: PersonView) => {
    setRemovingId(person.id);
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[person.id];
      return next;
    });

    try {
      await apiSend(
        `/api/trips/${tripId}/people/${person.id}`,
        'DELETE',
        undefined,
        tripId,
      );
      await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409) {
        setRowErrors((prev) => ({ ...prev, [person.id]: t('people.useMerge') }));
      } else {
        setRowErrors((prev) => ({
          ...prev,
          [person.id]: (err as Error).message || t('error.generic'),
        }));
      }
    } finally {
      setRemovingId(null);
    }
  };

  const handleChooseTarget = async (target: PersonView) => {
    if (!mergeSource) return;

    const confirmed = window.confirm(
      t('people.mergeConfirm', {
        from: mergeSource.name,
        into: target.name,
      }),
    );
    if (!confirmed) return;

    try {
      await apiSend(
        `/api/trips/${tripId}/people/merge`,
        'POST',
        { fromId: mergeSource.id, intoId: target.id },
        tripId,
      );
      await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
      setMergeSource(null);
    } catch (err) {
      alert((err as Error).message || t('error.generic'));
    }
  };

  return (
    <Screen title={t('people.title')} back={`/t/${tripId}/settings`}>
      <div className="fsl-people">
        <p className="fsl-people__explain">{t('people.mergeExplain')}</p>

        <div className="fsl-card">
          {view.people.map((person) => {
            const hasRowError = Boolean(rowErrors[person.id]);
            return (
              <div key={person.id} className="fsl-people__row">
                <div className="fsl-people__row-main">
                  <div className="fsl-people__info">
                    <Avatar name={person.name} />
                    <div className="fsl-people__details">
                      <div className="fsl-people__name-line">
                        <span className="fsl-people__name">{person.name}</span>
                        {person.status === 'pending' && (
                          <Pill tone="warning">{t('who.pending')}</Pill>
                        )}
                      </div>
                      <span className="fsl-people__role">
                        {person.isMember
                          ? t('people.member')
                          : t('people.guest')}
                      </span>
                    </div>
                  </div>

                  <div className="fsl-people__actions">
                    <Button
                      variant="secondary"
                      onClick={() => setMergeSource(person)}
                    >
                      {t('people.merge')}
                    </Button>
                    <Button
                      variant="ghost"
                      loading={removingId === person.id}
                      onClick={() => handleRemove(person)}
                    >
                      {t('people.remove')}
                    </Button>
                  </div>
                </div>

                {hasRowError && (
                  <div className="fsl-people__row-error">
                    {rowErrors[person.id]}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Sheet
          open={mergeSource !== null}
          onClose={() => setMergeSource(null)}
          title={
            mergeSource ? t('people.mergeInto', { name: mergeSource.name }) : ''
          }
        >
          <div className="fsl-people__targets">
            {mergeSource &&
              view.people
                .filter((p) => p.id !== mergeSource.id)
                .map((target) => (
                  <Button
                    key={target.id}
                    variant="secondary"
                    block
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
