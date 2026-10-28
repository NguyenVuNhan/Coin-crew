import { useState, useEffect, useId, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PickerView, Gender } from '@fsl/core';
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
import { GenderToggle } from '../components/GenderToggle';
import { SignInButtons, signInHref } from '../components/SignInButtons';
import { SignInSheet } from '../components/SignInSheet';
import { cn } from '@/lib/utils';

const REJOIN = 'rejoin';

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
    // Auto-select only until the user has chosen a row themselves.
    if (userTouched.current) return;
    if (picker) {
      const initial =
        myLeft
          ? REJOIN
          : (picker.myPick ??
            picker.people.find((p) => p.lastUsedHere)?.id ??
            null);
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
  }, [picker, myLeft, me?.user?.name]);

  const selectedPerson = picker?.people.find((p) => p.id === selectedId);

  function selectRadio(id: string) {
    userTouched.current = true;
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
      // Drop the cached "no name yet" view: the trip page would otherwise send us straight back here.
      queryClient.removeQueries({ queryKey: ['trip', tripId] });
      navigate(becomeMember ? `${target}${target.includes('?') ? '&' : '?'}becomeMember=1` : target);
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
      queryClient.removeQueries({ queryKey: ['trip', tripId] });
      queryClient.invalidateQueries({ queryKey: ['picker', tripId] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      navigate(target);
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
        <p className="fsl-who__subtitle m-0 mb-4 text-sm text-muted-foreground">{t('who.subtitle')}</p>
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
              <p className="fsl-who__similar m-0 mb-2 text-sm leading-snug text-foreground">
                {t('who.similar', { typed: account.name, name: similarMatch.name })}
              </p>
              <div className="fsl-who__similar-actions flex flex-col gap-2">
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
        className={cn(
          'fsl-who flex flex-col gap-4 py-4',
          !!actionError && 'fsl-who--bar-error max-lg:pb-24',
        )}
      >
        {!signedIn && account === null && (
          <section
            className="fsl-who__guest-note flex flex-col gap-2 rounded-xl border border-warning-border bg-warning-soft px-4 py-3 text-sm leading-snug text-warning-foreground"
            role="note"
            aria-labelledby={guestNoteId}
          >
            <h2 id={guestNoteId} className="fsl-who__guest-title m-0 flex items-center gap-2 text-base font-semibold leading-normal">
              <Icon name="info" size={16} className="shrink-0" />
              {t('who.guestTitle')}
            </h2>
            <ul className="fsl-who__guest-list m-0 flex flex-col gap-1 pl-5 list-disc">
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

        <p className="fsl-who__subtitle m-0 text-sm text-muted-foreground">{t('who.subtitle')}</p>

        <div className="fsl-who__pick-step flex flex-col gap-4">
          {showSearch && (
            <>
              <div className="fsl-who__search relative flex items-center">
                <span className="fsl-who__search-icon pointer-events-none absolute left-3 inline-flex text-subtle-foreground" aria-hidden="true">
                  <Icon name="search" size={18} />
                </span>
                <input
                  type="search"
                  aria-label={t('who.search')}
                  className="fsl-who__search-input h-11 min-h-11 w-full rounded-xl border border-input bg-card pl-10 pr-11 text-base text-foreground outline-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoComplete="off"
                />
                {query !== '' && (
                  <button
                    type="button"
                    className="fsl-who__search-clear absolute right-0 size-11 inline-flex items-center justify-center p-0 border-0 bg-transparent text-muted-foreground rounded-full cursor-pointer hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors motion-reduce:transition-none"
                    aria-label={t('who.clearSearch')}
                    title={t('who.clearSearch')}
                    onClick={() => setQuery('')}
                  >
                    <Icon name="x" size={18} />
                  </button>
                )}
              </div>
              <p className="fsl-who__count m-0 -mt-2 text-sm text-muted-foreground" role="status">
                {t('who.count', { shown: visible.length, total: people.length })}
              </p>
            </>
          )}

          {nameMatchId && selectedId === nameMatchId && selectedPerson && (
            <p className="fsl-who__subtitle m-0 text-sm text-muted-foreground" role="status">
              {t('who.nameMatch', { name: selectedPerson.name })}
            </p>
          )}

          {(visible.length > 0 || myLeft !== null) && (
            <div
              role="radiogroup"
              aria-label={t('who.title')}
              className="fsl-who__list flex flex-col bg-card rounded-xl border border-border divide-y divide-border overflow-hidden"
            >
              {myLeft && (
                <button
                  key="rejoin"
                  type="button"
                  role="radio"
                  aria-checked={selectedId === REJOIN}
                  className={cn(
                    'fsl-who__row fsl-who__row--radio flex items-center gap-3 px-4 py-3 min-h-11 w-full text-left text-foreground transition-colors motion-reduce:transition-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset border-0',
                    selectedId === REJOIN
                      ? 'fsl-who__row--selected bg-secondary ring-2 ring-inset ring-ring relative z-1'
                      : 'bg-card hover:bg-accent',
                  )}
                  onClick={() => selectRadio(REJOIN)}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      selectRadio(REJOIN);
                    }
                  }}
                >
                  <Avatar name={myLeft.name} />
                  <div className="fsl-who__row-info flex flex-1 flex-col gap-1 min-w-0">
                    <div className="fsl-who__row-name truncate text-base font-semibold text-foreground">{myLeft.name}</div>
                    <div className="fsl-who__row-sub text-sm text-muted-foreground">
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
                      href={signInHref(isZaloWebView() && me?.signIn.zalo ? 'zalo' : 'google', target)}
                      className="fsl-who__row fsl-who__row--member flex items-center gap-3 px-4 py-3 min-h-11 w-full text-left text-foreground bg-card hover:bg-accent no-underline cursor-pointer transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset border-0"
                      onClick={(e) => {
                        e.preventDefault();
                        setSignInOpen(true);
                      }}
                    >
                      <Avatar name={person.name} />
                      <div className="fsl-who__row-info flex flex-1 flex-col gap-1 min-w-0">
                        <div className="fsl-who__row-name truncate text-base font-semibold text-foreground">{person.name}</div>
                        <div className="fsl-who__row-sub text-sm text-muted-foreground">
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
                    className={cn(
                      'fsl-who__row fsl-who__row--radio flex items-center gap-3 px-4 py-3 min-h-11 w-full text-left text-foreground transition-colors motion-reduce:transition-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset border-0',
                      isSelected
                        ? 'fsl-who__row--selected bg-secondary ring-2 ring-inset ring-ring relative z-1'
                        : 'bg-card hover:bg-accent',
                    )}
                    onClick={() => selectRadio(person.id)}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        selectRadio(person.id);
                      }
                    }}
                  >
                    <Avatar name={person.name} />
                    <div className="fsl-who__row-info flex flex-1 flex-col gap-1 min-w-0">
                      <div className="fsl-who__row-name truncate text-base font-semibold text-foreground">{person.name}</div>
                      {person.lastUsedHere && (
                        <div className="fsl-who__row-sub text-sm text-muted-foreground">
                          {t('who.lastUsedHere')}
                        </div>
                      )}
                      {person.activeElsewhere && (
                        <div className="fsl-who__row-sub text-sm text-muted-foreground">
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
                className="fsl-who__join mt-2 flex min-h-11 w-full items-center rounded-xl border border-dashed border-border bg-transparent px-4 py-3 text-left font-medium text-primary transition-colors hover:enabled:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50 motion-reduce:transition-none"
                disabled={isSubmitting}
                onClick={onJoinRow}
              >
                {t('who.joinAs', { name: account.name })}
              </button>
              {joinStep === 'gender' && (
                <div className="fsl-who__join-gender flex items-center gap-2 px-4 pt-2">
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
      <SignInSheet open={signInOpen} onClose={() => setSignInOpen(false)} returnTo={target} />
    </Screen>
  );
}
