import { useState, useEffect, useId } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PickerView, Gender } from '@fsl/core';
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
import { GenderToggle } from '../components/GenderToggle';
import './WhoAreYou.css';

const REJOIN = 'rejoin';

export function WhoAreYou() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const t = useT();

  const guestNoteId = useId();
  const signInHref = `/api/auth/google/start?returnTo=${encodeURIComponent(`/t/${tripId}`)}`;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [actionError, setActionError] = useState<unknown>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [joinStep, setJoinStep] = useState<'none' | 'gender' | 'similar'>('none');
  const [joinGender, setJoinGender] = useState<Gender | null>(null);
  const [similarMatch, setSimilarMatch] = useState<{ id: string; name: string } | null>(null);

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

  const account = picker?.account ?? null;
  const myLeft = picker?.myLeftName ?? null;

  useEffect(() => {
    if (picker) {
      const initial =
        myLeft
          ? REJOIN
          : (picker.myPick ??
            picker.people.find((p) => p.lastUsedHere)?.id ??
            null);
      setSelectedId(initial);
    }
  }, [picker, myLeft]);

  const selectedPerson = picker?.people.find((p) => p.id === selectedId);

  function selectRadio(id: string) {
    setSelectedId(id);
    setJoinStep('none');
    setSimilarMatch(null);
  }

  async function handlePickPerson(participantId: string, becomeMember = false) {
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
      navigate(becomeMember ? `/t/${tripId}?becomeMember=1` : `/t/${tripId}`);
    } catch (err) {
      setActionError(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function join(body: Record<string, unknown>) {
    if (!tripId) return;
    setActionError(null);
    setIsSubmitting(true);
    try {
      await apiSend(`/api/trips/${tripId}/join`, 'POST', body, tripId);
      queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
      queryClient.invalidateQueries({ queryKey: ['picker', tripId] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      navigate(`/t/${tripId}`);
    } catch (err) {
      setActionError(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  function genderBody(): { gender?: Gender } {
    if (account?.needsGender && joinGender) {
      return { gender: joinGender };
    }
    return {};
  }

  async function startJoin() {
    if (!account || !tripId) return;
    setActionError(null);
    setIsSubmitting(true);
    let matches: { id: string; name: string }[] = [];
    try {
      const res = await apiSend<{ matches: { id: string; name: string }[] }>(
        `/api/trips/${tripId}/people/check-name`,
        'POST',
        { name: account.name },
        tripId,
      );
      matches = res.matches ?? [];
    } catch (err) {
      setActionError(err);
      setIsSubmitting(false);
      return;
    }

    const [first] = matches;
    if (first) {
      setSimilarMatch({ id: first.id, name: first.name });
      setJoinStep('similar');
      setIsSubmitting(false);
      return;
    }

    await join(genderBody());
  }

  function onJoinRow() {
    if (!account) return;
    if (account.needsGender && joinGender === null) {
      setJoinStep('gender');
      return;
    }
    void startJoin();
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
          {joinStep === 'similar' && similarMatch && account ? (
            <>
              <p className="fsl-who__similar">
                {t('who.similar', { typed: account.name, name: similarMatch.name })}
              </p>
              <div className="fsl-who__similar-actions">
                <Button
                  variant="primary"
                  block
                  disabled={isSubmitting}
                  onClick={() => handlePickPerson(similarMatch.id, true)}
                >
                  {t('who.yesIm', { name: similarMatch.name })}
                </Button>
                <Button
                  variant="secondary"
                  block
                  disabled={isSubmitting}
                  onClick={() => join({ confirmNew: true, ...genderBody() })}
                >
                  {t('who.noAddMe')}
                </Button>
              </div>
            </>
          ) : joinStep === 'gender' && account ? (
            <Button
              variant="primary"
              block
              disabled={joinGender === null || isSubmitting}
              onClick={startJoin}
            >
              {t('who.joinButton', { name: account.name })}
            </Button>
          ) : selectedId === REJOIN && myLeft ? (
            <Button
              variant="primary"
              block
              disabled={isSubmitting}
              onClick={() => join({})}
            >
              {t('who.rejoinAs', { name: myLeft.name })}
            </Button>
          ) : (
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
          )}
        </>
      }
    >
      <div
        className={`fsl-who${actionError ? ' fsl-who--bar-error' : ''}`}
      >
        {account === null && (
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
        )}

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

          {(visible.length > 0 || myLeft !== null) && (
            <div
              role="radiogroup"
              aria-label={t('who.title')}
              className="fsl-who__list"
            >
              {myLeft && (
                <button
                  key="rejoin"
                  type="button"
                  role="radio"
                  aria-checked={selectedId === REJOIN}
                  className={`fsl-who__row fsl-who__row--radio ${selectedId === REJOIN ? 'fsl-who__row--selected' : ''}`}
                  onClick={() => selectRadio(REJOIN)}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      selectRadio(REJOIN);
                    }
                  }}
                >
                  <Avatar name={myLeft.name} />
                  <div className="fsl-who__row-info">
                    <div className="fsl-who__row-name">{myLeft.name}</div>
                    <div className="fsl-who__row-sub">
                      {t('who.rejoinHint')}
                    </div>
                  </div>
                </button>
              )}

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
                    onClick={() => selectRadio(person.id)}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        selectRadio(person.id);
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

          {account && !myLeft && (
            <>
              <button
                type="button"
                className="fsl-who__join"
                disabled={isSubmitting}
                onClick={onJoinRow}
              >
                {t('who.joinAs', { name: account.name })}
              </button>
              {joinStep === 'gender' && (
                <div className="fsl-who__join-gender">
                  <GenderToggle
                    name={account.name}
                    value={joinGender}
                    onChange={setJoinGender}
                    disabled={isSubmitting}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Screen>
  );
}
