import { useState, useEffect, useId } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PickerView } from '@fsl/core';
import { normalizeName } from '@fsl/core';
import { useT } from '../i18n';
import { apiFetch, apiSend } from '../api/client';
import { formatAgo } from '../lib/time';
import { Screen } from '../components/Screen';
import { LanguageButton } from '../components/LanguageButton';
import { Avatar } from '../components/Avatar';
import { Pill } from '../components/Pill';
import { Button } from '../components/Button';
import { SkeletonList } from '../components/Skeleton';
import { InlineError } from '../components/InlineError';
import { Icon } from '../components/icons';
import './WhoAreYou.css';

export function safeTripPath(next: string | null, tripId: string): string {
  const fallback = `/t/${tripId}`;
  if (!next) return fallback;
  if (next !== fallback && !next.startsWith(`${fallback}/`)) return fallback;
  if (next.includes('//') || next.includes('\\')) return fallback;
  for (let i = 0; i < next.length; i++) {
    const code = next.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return fallback;
  }
  return next;
}

export function WhoAreYou() {
  const { tripId } = useParams<{ tripId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const t = useT();

  const target = safeTripPath(searchParams.get('next'), tripId ?? '');

  const guestNoteId = useId();
  const signInHref = `/api/auth/google/start?returnTo=${encodeURIComponent(target)}`;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [actionError, setActionError] = useState<unknown>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    data: picker,
    error,
    isLoading,
    refetch,
  } = useQuery<PickerView>({
    queryKey: ['picker', tripId],
    queryFn: () =>
      apiFetch<PickerView>(`/api/trips/${tripId}/people/picker`, { tripId }),
    enabled: Boolean(tripId),
  });

  useEffect(() => {
    if (picker) {
      const initial =
        picker.myPick ??
        picker.people.find((p) => p.lastUsedHere)?.id ??
        null;
      setSelectedId(initial);
    }
  }, [picker]);

  const selectedPerson = picker?.people.find((p) => p.id === selectedId);

  async function handlePickPerson(participantId: string) {
    if (!tripId) return;
    setActionError(null);
    setIsSubmitting(true);
    try {
      await apiSend(
        `/api/trips/${tripId}/people/pick`,
        'POST',
        { participantId },
        tripId,
      );
      queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
      navigate(target);
    } catch (err) {
      setActionError(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <Screen title={t('who.title')} right={<LanguageButton />}>
        <p className="fsl-who__subtitle">{t('who.subtitle')}</p>
        <SkeletonList rows={4} />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title={t('who.title')} right={<LanguageButton />}>
        <InlineError error={error} onRetry={() => refetch()} />
      </Screen>
    );
  }

  const people = picker?.people ?? [];
  const showSearch = people.length > 10;
  const needle = normalizeName(query);
  const visible = showSearch && needle ? people.filter((p) => normalizeName(p.name).includes(needle)) : people;
  const chosen = selectedPerson && visible.some((p) => p.id === selectedPerson.id) ? selectedPerson : undefined;

  return (
    <Screen
      title={t('who.title')}
      right={<LanguageButton />}
      bottomBar={
        <>
          {actionError ? <InlineError error={actionError} /> : null}
          <Button
            variant="primary"
            block
            disabled={!chosen || isSubmitting}
            onClick={() => chosen && handlePickPerson(chosen.id)}
          >
            {chosen
              ? t('who.continueAs', { name: chosen.name })
              : t('common.continue')}
          </Button>
        </>
      }
    >
      <div
        className={`fsl-who${actionError ? ' fsl-who--bar-error' : ''}`}
      >
        <section className="fsl-who__guest-note" role="note" aria-labelledby={guestNoteId}>
          <h2 id={guestNoteId} className="fsl-who__guest-title">
            <Icon name="info" size={16} />
            {t('who.guestTitle')}
          </h2>
          <ul className="fsl-who__guest-list">
            <li>{t('who.guestExpenses')}</li>
            <li>{t('who.guestBank')}</li>
          </ul>
          <a href={signInHref} className="fsl-who__guest-signin">
            {t('who.guestSignIn')}
          </a>
        </section>

        <p className="fsl-who__subtitle">{t('who.subtitle')}</p>

        <div className="fsl-who__pick-step">
          {showSearch && (
            <>
              <div className="fsl-who__search">
                <span className="fsl-who__search-icon" aria-hidden="true">
                  <Icon name="search" size={18} />
                </span>
                <input
                  type="search"
                  aria-label={t('who.search')}
                  className="fsl-who__search-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoComplete="off"
                />
                {query !== '' && (
                  <button
                    type="button"
                    className="fsl-who__search-clear"
                    aria-label={t('who.clearSearch')}
                    title={t('who.clearSearch')}
                    onClick={() => setQuery('')}
                  >
                    <Icon name="x" size={18} />
                  </button>
                )}
              </div>
              <p className="fsl-who__count" role="status">
                {t('who.count', { shown: visible.length, total: people.length })}
              </p>
            </>
          )}

          {visible.length > 0 && (
            <div
              role="radiogroup"
              aria-label={t('who.title')}
              className="fsl-who__list"
            >
              {visible.map((person) => {
                if (person.isMember) {
                  return (
                    <a
                      key={person.id}
                      href={`/api/auth/google/start?returnTo=${encodeURIComponent(target)}`}
                      className="fsl-who__row fsl-who__row--member"
                    >
                      <Avatar name={person.name} />
                      <div className="fsl-who__row-info">
                        <div className="fsl-who__row-name">{person.name}</div>
                        <div className="fsl-who__row-sub">
                          {t('who.hasAccount')}
                        </div>
                      </div>
                    </a>
                  );
                }

                const isSelected = selectedId === person.id;

                return (
                  <button
                    key={person.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={`fsl-who__row fsl-who__row--radio ${isSelected ? 'fsl-who__row--selected' : ''}`}
                    onClick={() => setSelectedId(person.id)}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        setSelectedId(person.id);
                      }
                    }}
                  >
                    <Avatar name={person.name} />
                    <div className="fsl-who__row-info">
                      <div className="fsl-who__row-name">{person.name}</div>
                      {person.lastUsedHere && (
                        <div className="fsl-who__row-sub">
                          {t('who.lastUsedHere')}
                        </div>
                      )}
                      {person.activeElsewhere && (
                        <div className="fsl-who__row-sub">
                          {t('who.activeElsewhere', {
                            ago: formatAgo(person.activeElsewhere),
                          })}
                        </div>
                      )}
                    </div>
                    {person.status === 'pending' && (
                      <Pill tone="warning">{t('who.pending')}</Pill>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Screen>
  );
}
