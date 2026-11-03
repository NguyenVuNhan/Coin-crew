import { useState, useEffect, useId, useRef } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PickerView, Gender } from '@cc/core';
import { normalizeName, findSimilarNames } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { useMe } from '@cc/web-data-access/hooks';
import { apiFetch, apiSend, ApiClientError } from '@cc/web-data-access/client';
import { formatAgo } from '@cc/web-util/time';
import { isZaloWebView } from '@cc/web-util/zaloEnv';
import { useTrip } from '../lib/tripBase';
import { useBack } from '../lib/navHistory';
import { Screen } from '../components/Screen';
import { LanguageButton } from '@cc/web-ui/components/LanguageButton';
import { Avatar } from '@cc/web-ui/components/Avatar';
import { Pill } from '@cc/web-ui/components/Pill';
import { Button } from '@cc/web-ui/components/Button';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { NoAccess } from '../components/NoAccess';
import { Icon } from '@cc/web-ui/components/icons';
import { GenderToggle } from '../components/GenderToggle';
import { SignInButtons, signInHref } from '../components/SignInButtons';
import { SignInSheet } from '../components/SignInSheet';
import { ClaimSheet } from '../components/ClaimSheet';
import { ZaloSignIn } from '../components/ZaloSignIn';
import { browserUrl } from '@cc/web-util/openInBrowser';
import { usePlatform } from '@cc/web-platform';
import { Input } from '@cc/web-ui/components/ui/input';
import { cn } from '@cc/web-ui/lib/utils';

const REJOIN = 'rejoin';

/** `next` when it is one of this trip's pages under `base` (`/t/<tripId>` or `/j/<token>`), else the trip itself. */
export function safeTripPath(next: string | null, tripId: string, base = `/t/${tripId}`): string {
  const fallback = base;
  if (!next) return fallback;
  if (next !== fallback && !next.startsWith(`${fallback}/`)) return fallback;
  if (next.includes('//') || next.includes('\\')) return fallback;
  for (let i = 0; i < next.length; i++) {
    const code = next.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return fallback;
  }
  return next;
}

function ClaimWaitingWhoStrip({ name }: { name: string }) {
  const t = useT();
  const [showSteps, setShowSteps] = useState(false);
  const currentHref = typeof window !== 'undefined' && window.location ? window.location.href : '';
  const openBrowserHref = browserUrl(currentHref);

  return (
    <div className="rounded-xl bg-warning-soft px-4 py-3 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm text-foreground">
        <Icon name="clock" size={16} className="shrink-0" />
        <span>{t('claim.waitingWho', { name })}</span>
      </div>
      {openBrowserHref ? (
        <Button
          variant="ghost"
          block
          href={openBrowserHref}
          className="min-h-11 justify-center"
        >
          {t('claim.openBrowser')}
        </Button>
      ) : (
        <>
          <Button
            variant="ghost"
            block
            onClick={() => setShowSteps((s) => !s)}
            className="min-h-11 justify-center"
          >
            {t('claim.openBrowser')}
          </Button>
          {showSteps && (
            <p className="m-0 text-sm text-muted-foreground text-center">
              {t('claim.browserSteps')}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function WhoAreYou() {
  const { tripId, base } = useTrip();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const t = useT();

  const expenseId = searchParams.get('expense');
  const isExpenseMode = Boolean(expenseId);

  const me = useMe().data;
  const signedIn = Boolean(me?.user);
  const platform = usePlatform();
  const isZmp = platform.kind === 'zmp';
  const [zaloName, setZaloName] = useState<string | null>(null);

  const target = safeTripPath(searchParams.get('next'), tripId, base);
  const { goBack } = useBack(target);

  const guestNoteId = useId();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nameMatchId, setNameMatchId] = useState<string | null>(null);
  const userTouched = useRef(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [claimPerson, setClaimPerson] = useState<{ id: string; name: string } | null>(null);
  const [claimOpen, setClaimOpen] = useState(false);
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
    queryKey: expenseId ? ['picker', tripId, expenseId] : ['picker', tripId],
    queryFn: () =>
      apiFetch<PickerView>(
        expenseId
          ? `/api/trips/${tripId}/people/picker?expense=${encodeURIComponent(expenseId)}`
          : `/api/trips/${tripId}/people/picker`,
        { tripId },
      ),
    enabled: Boolean(tripId),
  });

  const account = picker?.account ?? null;
  const myLeft = picker?.myLeftName ?? null;

  // In Zalo: the Zalo name of a signed-in Zalo user, else the one remembered from the last Zalo sign-in.
  const meZaloName = me?.user?.providers.includes('zalo') ? (me.user.zaloName ?? me.user.name) : null;
  useEffect(() => {
    if (!isZmp) return;
    if (meZaloName) {
      setZaloName(meZaloName);
      return;
    }
    let live = true;
    platform.storage.get('zaloName').then(
      (n) => live && setZaloName(n || null),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [isZmp, platform, meZaloName]);

  // One clear best look-alike among the names not taken by a member, else no suggestion.
  let zaloMatch: { id: string; name: string } | null = null;
  if (isZmp && zaloName && picker && !myLeft && !picker.myPick) {
    const matches = findSimilarNames(zaloName, picker.people.filter((p) => !p.isMember));
    const bestRank = matches[0]?.reason;
    const best = bestRank ? matches.filter((m) => m.reason === bestRank) : [];
    if (best.length === 1) zaloMatch = { id: best[0]!.id, name: best[0]!.name };
  }
  const zaloMatchId = zaloMatch?.id ?? null;

  useEffect(() => {
    // Auto-select only until the user has chosen a row themselves.
    if (userTouched.current) return;
    if (picker) {
      const initial =
        !isExpenseMode && myLeft
          ? REJOIN
          : (picker.myPick ??
            picker.people.find((p) => p.lastUsedHere)?.id ??
            null);
      if (initial) {
        setSelectedId(initial);
        setNameMatchId(null);
      } else if (zaloMatchId) {
        setSelectedId(zaloMatchId);
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
  }, [picker, myLeft, me?.user?.name, zaloMatchId, isExpenseMode]);

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
      queryClient.removeQueries({ queryKey: ['expense-pay', tripId] });
      if (searchParams.get('next') !== null || becomeMember) {
        navigate(becomeMember ? `${target}${target.includes('?') ? '&' : '?'}becomeMember=1` : target, { replace: true });
      } else {
        goBack();
      }
    } catch (err) {
      setActionError(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePickFriend(participantId: string) {
    if (!tripId || !expenseId) return;
    setActionError(null);
    setIsSubmitting(true);
    try {
      await apiSend(
        `/api/trips/${tripId}/expenses/${expenseId}/friend`,
        'POST',
        { participantId },
        tripId,
      );
      // The pay screen cached "no row" before the pick: drop it so it asks again.
      queryClient.removeQueries({ queryKey: ['expense-pay', tripId] });
      navigate(target, { replace: true });
    } catch (err) {
      setActionError(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderNameOrFriend(name: string) {
    const fullText = t('who.nameOrFriend', { name });
    const rest = fullText.startsWith(name) ? fullText.slice(name.length) : null;
    const match = rest ? rest.match(/^(\s+(?:hoặc|or)\s+)(.+)$/) : null;
    if (match) {
      return (
        <span>
          {name}
          {match[1]}
          <Icon name="userPlus" size={14} className="inline mr-1 align-[-1px]" />
          {match[2]}
        </span>
      );
    }
    return fullText;
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
      if (searchParams.get('next') !== null) {
        navigate(target, { replace: true });
      } else {
        goBack();
      }
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

  // A Zalo account already waiting to join someone here came from a payment page: go back to it (locked to that
  // person) instead of asking "Who are you?" again. Zalo's login can hand back to this picker, not the payment.
  const waitingClaim = me?.mergeRequests?.claim;
  if (waitingClaim && waitingClaim.tripId === tripId && searchParams.get('next') !== null && /\/expenses\/[^/]+\/pay$/.test(target.split('?')[0] ?? '')) {
    return <Navigate to={target} replace />;
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
        {error instanceof ApiClientError && error.code === 'FORBIDDEN' ? (
          <NoAccess returnTo={target} />
        ) : (
          <InlineError error={error} onRetry={() => refetch()} />
        )}
      </Screen>
    );
  }

  // A signed-in member is already someone in this group; picking a name is only for guests (the API refuses it).
  const myRow = picker?.people.find((p) => p.id === picker.myPick);
  if (signedIn && account === null && myRow?.isMember) {
    return <Navigate to={target} replace />;
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
          ) : !isExpenseMode && selectedId === REJOIN && myLeft ? (
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
              onClick={() => {
                if (!chosen) return;
                if (isExpenseMode && chosen.isMember && (chosen.slots ?? 0) >= 2) {
                  void handlePickFriend(chosen.id);
                } else {
                  void handlePickPerson(chosen.id);
                }
              }}
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
        {isZmp && !signedIn && <ZaloSignIn />}

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
            {!isZmp && (
              <SignInButtons
                returnTo={target}
                layout="inline"
                labels={{ google: 'who.guestSignIn', zalo: 'who.guestSignInZalo' }}
              />
            )}
          </section>
        )}

        <p className="fsl-who__subtitle m-0 text-sm text-muted-foreground">{t('who.subtitle')}</p>

        <div className="fsl-who__pick-step flex flex-col gap-4">
          {me?.mergeRequests?.claim && (
            <ClaimWaitingWhoStrip name={me.mergeRequests.claim.name} />
          )}

          {showSearch && (
            <>
              <div className="fsl-who__search relative flex items-center">
                <span className="fsl-who__search-icon pointer-events-none absolute left-3 inline-flex text-subtle-foreground" aria-hidden="true">
                  <Icon name="search" size={18} />
                </span>
                <Input
                  type="search"
                  aria-label={t('who.search')}
                  className="fsl-who__search-input pl-10 pr-11 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
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

          {zaloMatch && (
            <section
              className="fsl-who__zalo-match flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3"
              role="status"
            >
              <p className="fsl-who__zalo-match-text m-0 text-base font-semibold text-foreground">
                {t('who.zaloMatch', { name: zaloMatch.name })}
              </p>
              <Button
                variant="primary"
                block
                disabled={isSubmitting}
                onClick={() => zaloMatch && handlePickPerson(zaloMatch.id)}
              >
                {t('who.zaloMatchContinue', { name: zaloMatch.name })}
              </Button>
            </section>
          )}

          {nameMatchId && selectedId === nameMatchId && selectedPerson && (
            <p className="fsl-who__subtitle m-0 text-sm text-muted-foreground" role="status">
              {t('who.nameMatch', { name: selectedPerson.name })}
            </p>
          )}

          {(visible.length > 0 || (!isExpenseMode && myLeft !== null)) && (
            <div
              role="radiogroup"
              aria-label={t('who.title')}
              className="fsl-who__list flex flex-col bg-card rounded-xl border border-border divide-y divide-border overflow-hidden"
            >
              {!isExpenseMode && myLeft && (
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
                const hasMultipleSlots = (person.slots ?? 0) >= 2;

                if (person.isMember && (!isExpenseMode || !hasMultipleSlots)) {
                  const inZaloBrowser = !isZmp && isZaloWebView();
                  return (
                    <a
                      key={person.id}
                      href={
                        inZaloBrowser
                          ? signInHref('zalo', target, undefined, { tripId, participantId: person.id })
                          : signInHref(isZaloWebView() && me?.signIn.zalo ? 'zalo' : 'google', target)
                      }
                      className="fsl-who__row fsl-who__row--member flex items-center gap-3 px-4 py-3 min-h-11 w-full text-left text-foreground bg-card hover:bg-accent no-underline cursor-pointer transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset border-0"
                      onClick={(e) => {
                        e.preventDefault();
                        if (inZaloBrowser) {
                          setClaimPerson({ id: person.id, name: person.name });
                          setClaimOpen(true);
                        } else {
                          setSignInOpen(true);
                        }
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
                      <div className="fsl-who__row-name truncate text-base font-semibold text-foreground">
                        {hasMultipleSlots ? renderNameOrFriend(person.name) : person.name}
                      </div>
                      {hasMultipleSlots && (
                        <div className="fsl-who__row-sub text-sm text-muted-foreground">
                          {t('who.slots', { n: person.slots! })}
                        </div>
                      )}
                      {person.lastUsedHere && !hasMultipleSlots && (
                        <div className="fsl-who__row-sub text-sm text-muted-foreground">
                          {t('who.lastUsedHere')}
                        </div>
                      )}
                      {person.activeElsewhere && !hasMultipleSlots && (
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

          {!isExpenseMode && account && !myLeft && (
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
      <ClaimSheet
        open={claimOpen}
        name={claimPerson?.name ?? ''}
        tripId={tripId}
        participantId={claimPerson?.id ?? ''}
        returnTo={target}
        onClose={() => setClaimOpen(false)}
      />
    </Screen>
  );
}
