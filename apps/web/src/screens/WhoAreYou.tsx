import { useState, useEffect, useId, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PickerView } from '@fsl/core';
import { normalizeName, findSimilarNames } from '@fsl/core';
import { useT } from '../i18n';
import { useMe } from '../api/hooks';
import { apiFetch, apiSend } from '../api/client';
import { formatAgo } from '../lib/time';
import { isZaloWebView } from '../lib/zaloEnv';
import { Screen } from '../components/Screen';
import { LanguageButton } from '../components/LanguageButton';
import { Avatar } from '../components/Avatar';
import { Pill } from '../components/Pill';
import { Button } from '../components/Button';
import { SkeletonList } from '../components/Skeleton';
import { InlineError } from '../components/InlineError';
import { Icon } from '../components/icons';
import { SignInButtons, signInHref } from '../components/SignInButtons';
import { SignInSheet } from '../components/SignInSheet';
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

  const me = useMe().data;
  const signedIn = Boolean(me?.user);

  const target = safeTripPath(searchParams.get('next'), tripId ?? '');

  const guestNoteId = useId();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nameMatchId, setNameMatchId] = useState<string | null>(null);
  const userTouched = useRef(false);
  const [signInOpen, setSignInOpen] = useState(false);
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
    // Auto-select only until the user has chosen a row themselves.
    if (userTouched.current) return;
    if (picker) {
      const initial =
        picker.myPick ??
        picker.people.find((p) => p.lastUsedHere)?.id ??
        null;
      if (initial) {
        setSelectedId(initial);
        setNameMatchId(null);
      } else if (me?.user) {
        const rows = picker.people.filter((p) => !p.isMember);
        const matches = findSimilarNames(me.user.name, rows);
        const bestRank = matches[0]?.reason;
        const bestMatches = bestRank ? matches.filter((m) => m.reason === bestRank) : [];
        if (bestMatches.length === 1) {
          const match = bestMatches[0]!;
          setSelectedId(match.id);
          setNameMatchId(match.id);
        } else {
          setSelectedId(initial);
          setNameMatchId(null);
        }
      } else {
        setSelectedId(initial);
        setNameMatchId(null);
      }
    }
  }, [picker, me?.user?.name]);

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
        {!signedIn && (
          <section className="fsl-who__guest-note" role="note" aria-labelledby={guestNoteId}>
            <h2 id={guestNoteId} className="fsl-who__guest-title">
              <Icon name="info" size={16} />
              {t('who.guestTitle')}
            </h2>
            <ul className="fsl-who__guest-list">
              <li>{t('who.guestExpenses')}</li>
              <li>{t('who.guestBank')}</li>
            </ul>
            <SignInButtons
              returnTo={target}
              layout="inline"
              labels={{ google: 'who.guestSignIn', zalo: 'who.guestSignInZalo' }}
            />
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

          {nameMatchId && selectedId === nameMatchId && selectedPerson && (
            <p className="fsl-who__subtitle" role="status">
              {t('who.nameMatch', { name: selectedPerson.name })}
            </p>
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
                      href={signInHref(isZaloWebView() && me?.signIn.zalo ? 'zalo' : 'google', target)}
                      className="fsl-who__row fsl-who__row--member"
                      onClick={(e) => {
                        e.preventDefault();
                        setSignInOpen(true);
                      }}
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
                    onClick={() => {
                      userTouched.current = true;
                      setSelectedId(person.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        userTouched.current = true;
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
      <SignInSheet open={signInOpen} onClose={() => setSignInOpen(false)} returnTo={target} />
    </Screen>
  );
}
