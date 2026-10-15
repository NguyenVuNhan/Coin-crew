import { useState, useEffect, useId } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PickerView, NameCandidate } from '@fsl/core';
import { suggestNames, normalizeName } from '@fsl/core';
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

export function WhoAreYou() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const t = useT();

  const nameInputId = useId();
  const listboxId = useId();

  const [step, setStep] = useState<'pick' | 'new'>('pick');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [amberMatch, setAmberMatch] = useState<NameCandidate | null>(null);
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
      navigate(`/t/${tripId}`);
    } catch (err) {
      setActionError(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handlePickCandidate(candidateId: string) {
    if (!tripId) return;
    const person = picker?.people.find((p) => p.id === candidateId);
    if (person?.isMember) {
      window.location.assign(
        `/api/auth/google/start?returnTo=${encodeURIComponent(`/t/${tripId}`)}`,
      );
      return;
    }
    handlePickPerson(candidateId);
  }

  async function handleCheckName() {
    if (!tripId) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    setActionError(null);
    setIsSubmitting(true);
    try {
      const checkRes = await apiSend<{
        matches: NameCandidate[];
      }>(
        `/api/trips/${tripId}/people/check-name`,
        'POST',
        { name: trimmed },
        tripId,
      );

      const firstMatch = checkRes.matches?.[0];
      if (firstMatch) {
        setAmberMatch(firstMatch);
      } else {
        await apiSend(
          `/api/trips/${tripId}/people`,
          'POST',
          { name: trimmed, confirmNew: false },
          tripId,
        );
        queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
        navigate(`/t/${tripId}`);
      }
    } catch (err) {
      setActionError(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirmNew() {
    if (!tripId) return;
    const trimmed = name.trim();
    setActionError(null);
    setIsSubmitting(true);
    try {
      await apiSend(
        `/api/trips/${tripId}/people`,
        'POST',
        { name: trimmed, confirmNew: true },
        tripId,
      );
      queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
      navigate(`/t/${tripId}`);
    } catch (err) {
      setActionError(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleAddNamed() {
    setName(query.trim());
    setAmberMatch(null);
    setActionError(null);
    setStep('new');
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
  const noMatch = showSearch && needle !== '' && visible.length === 0;
  // The bottom bar offers only a name the person can see: a search that hides the pre-selected one leaves nothing
  // chosen until it shows again (the choice comes back when the search is cleared).
  const chosen = selectedPerson && visible.some((p) => p.id === selectedPerson.id) ? selectedPerson : undefined;

  const trimmed = name.trim();
  const suggestions =
    step === 'new' && trimmed && picker
      ? suggestNames(
          trimmed,
          picker.people.map((p) => ({ id: p.id, name: p.name })),
        )
      : [];

  return (
    <Screen
      title={t('who.title')}
      right={<LanguageButton />}
      bottomBar={
        step === 'pick' ? (
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
        ) : undefined
      }
    >
      <div
        className={`fsl-who${step === 'pick' && actionError ? ' fsl-who--bar-error' : ''}`}
      >
        <p className="fsl-who__subtitle">{t('who.subtitle')}</p>

        {step === 'pick' ? (
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
                        href={`/api/auth/google/start?returnTo=${encodeURIComponent(`/t/${tripId}`)}`}
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

            <div className="fsl-who__actions">
              {noMatch ? (
                <Button variant="secondary" block onClick={handleAddNamed}>
                  {t('who.addNamed', { name: query.trim() })}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  block
                  onClick={() => {
                    setStep('new');
                    setActionError(null);
                  }}
                >
                  {t('who.someoneNew')}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="fsl-who__new-step">
            <h2 className="fsl-who__new-title">{t('who.newTitle')}</h2>
            <p className="fsl-who__new-hint">{t('who.newHint')}</p>

            <div className="fsl-who__field">
              <label htmlFor={nameInputId} className="fsl-who__label">
                {t('who.nameLabel')}
              </label>
              <input
                id={nameInputId}
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setAmberMatch(null);
                  setActionError(null);
                }}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={suggestions.length > 0}
                aria-controls={listboxId}
                className="fsl-who__input"
                autoComplete="off"
              />

              {suggestions.length > 0 && (
                <div
                  id={listboxId}
                  role="listbox"
                  className="fsl-who__suggestions"
                >
                  {suggestions.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      role="option"
                      aria-selected="false"
                      className="fsl-who__suggestion-item"
                      onClick={() => handlePickCandidate(candidate.id)}
                    >
                      <Avatar name={candidate.name} size="sm" />
                      <div className="fsl-who__suggestion-info">
                        <span className="fsl-who__suggestion-name">
                          {candidate.name}
                        </span>
                        <span className="fsl-who__suggestion-muted">
                          {t('who.inTrip')}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {amberMatch ? (
              <div role="alert" className="fsl-who__amber-card">
                <div className="fsl-who__amber-title">
                  {t('who.areYou', { name: amberMatch.name })}
                </div>
                <p className="fsl-who__amber-text">
                  {t('who.similar', {
                    typed: trimmed,
                    name: amberMatch.name,
                  })}
                </p>
                <div className="fsl-who__amber-actions">
                  {actionError ? <InlineError error={actionError} /> : null}
                  <Button
                    variant="primary"
                    block
                    disabled={isSubmitting}
                    onClick={() => handlePickCandidate(amberMatch.id)}
                  >
                    {t('who.yesIm', { name: amberMatch.name })}
                  </Button>
                  <Button
                    variant="secondary"
                    block
                    disabled={isSubmitting}
                    onClick={handleConfirmNew}
                  >
                    {t('who.noAddMe')}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {actionError ? <InlineError error={actionError} /> : null}
                <Button
                  variant="primary"
                  block
                  disabled={!trimmed || isSubmitting}
                  onClick={handleCheckName}
                >
                  {t('common.continue')}
                </Button>
              </>
            )}

            <p className="fsl-who__new-note">{t('who.newPendingNote')}</p>

            <Button
              variant="ghost"
              block
              onClick={() => {
                setStep('pick');
                setAmberMatch(null);
                setActionError(null);
              }}
            >
              {t('common.back')}
            </Button>
          </div>
        )}
      </div>
    </Screen>
  );
}
