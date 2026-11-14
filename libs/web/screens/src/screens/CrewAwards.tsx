import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import { can } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { useAttendance } from '@cc/web-data-access/attendance';
import { useTripView } from '@cc/web-data-access/hooks';
import { usePlatform } from '@cc/web-platform';
import { renderMemePng, type MemeInput, type MemeKind } from '@cc/web-util/memeCards';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Skeleton } from '@cc/web-ui/components/Skeleton';
import { Screen } from '../components/Screen';
import { AwardNightCard } from '../components/meme/AwardNightCard';
import { WantedCard } from '../components/meme/WantedCard';
import { VerseCard } from '../components/meme/VerseCard';
import { BoardCard } from '../components/meme/BoardCard';
import { buildAwards } from '../lib/awards';
import { useBack } from '../lib/navHistory';
import { actorOf } from '../lib/rowActions';
import { awardShareCard } from '../lib/shareCards';
import { useTrip } from '../lib/tripBase';
import { useImageShare } from '../lib/useImageShare';

function loadMemeFonts(): void {
  void import('@fontsource/alfa-slab-one/vietnamese-400.css');
  void import('@fontsource/alfa-slab-one/latin-400.css');
  void import('@fontsource/bungee/vietnamese-400.css');
  void import('@fontsource/bungee/latin-400.css');
  void import('@fontsource/playfair-display/vietnamese-700.css');
  void import('@fontsource/playfair-display/latin-700.css');
  void import('@fontsource/playfair-display/vietnamese-500-italic.css');
  void import('@fontsource/playfair-display/latin-500-italic.css');
  void import('@fontsource/be-vietnam-pro/vietnamese-800.css');
  void import('@fontsource/be-vietnam-pro/latin-800.css');
  void import('@fontsource/be-vietnam-pro/vietnamese-900.css');
  void import('@fontsource/be-vietnam-pro/latin-900.css');
}

export function CrewAwards() {
  const t = useT();
  const platform = usePlatform();
  const { share, status: shareStatus, sharing, sheet } = useImageShare();
  const { tripId, base, href } = useTrip();
  const goBack = useBack(base).goBack;

  useEffect(() => {
    loadMemeFonts();
  }, []);

  const { view, isLoading: tripLoading, error: tripError, refetch: refetchTrip } = useTripView(tripId ?? '', 0);
  const isAdmin = Boolean(view && can(actorOf(view), 'plan_session'));
  const attendance = useAttendance(tripId ?? '', { enabled: isAdmin });

  const activePeople = useMemo(
    () => (view?.people ?? []).filter((p) => p.status !== 'left').map((p) => ({ id: p.id, name: p.name })),
    [view?.people],
  );

  const tripName = view?.trip.name ?? '';
  const content = useMemo(
    () => (attendance.data ? buildAwards(attendance.data, activePeople, t, tripName) : null),
    [attendance.data, activePeople, t, tripName],
  );

  const [pickedWantedId, setPickedWantedId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'failed' | null>(null);
  const [activeSource, setActiveSource] = useState<'save' | 'share' | null>(null);
  const status = activeSource === 'save' ? saveStatus : shareStatus;

  if (tripLoading) {
    return (
      <Screen title={t('awards.title')} onBack={goBack}>
        <div className="fsl-awards flex flex-col gap-4 py-4">
          <Skeleton height={320} radius="xl" />
        </div>
      </Screen>
    );
  }

  if (tripError) {
    return (
      <Screen title={t('awards.title')} onBack={goBack}>
        <div className="fsl-awards flex flex-col gap-4 py-4">
          <InlineError error={tripError} onRetry={refetchTrip} />
        </div>
      </Screen>
    );
  }

  if (!view) return null;

  if (!isAdmin) {
    return <Navigate to={href()} replace />;
  }

  if (attendance.isPending) {
    return (
      <Screen title={t('awards.title')} onBack={goBack}>
        <div className="fsl-awards flex flex-col gap-4 py-4">
          <Skeleton height={320} radius="xl" />
        </div>
      </Screen>
    );
  }

  if (attendance.error) {
    return (
      <Screen title={t('awards.title')} onBack={goBack}>
        <div className="fsl-awards flex flex-col gap-4 py-4">
          <InlineError error={attendance.error} onRetry={() => void attendance.refetch()} />
        </div>
      </Screen>
    );
  }

  const nameMap = new Map(activePeople.filter((p) => p.name).map((p) => [p.id, p.name]));
  const wantedCandidates = content ? content.wantedCandidates.filter((cid) => nameMap.has(cid)) : [];

  const hasAnyCard = Boolean(
    content && (content.awards || wantedCandidates.length > 0 || content.verse || content.board),
  );

  if (!content || !hasAnyCard) {
    return (
      <Screen title={t('awards.title')} onBack={goBack}>
        <div className="fsl-awards flex flex-col gap-4 py-4">
          <p
            data-testid="awards-empty"
            className="fsl-awards__empty m-0 rounded-xl border border-border bg-card p-5 text-center text-sm text-muted-foreground"
          >
            {t('awards.empty')}
          </p>
        </div>
      </Screen>
    );
  }

  const wantedId =
    pickedWantedId && wantedCandidates.includes(pickedWantedId)
      ? pickedWantedId
      : (wantedCandidates[0] ?? null);
  const wantedInput = wantedId ? content.wanted(wantedId) : null;

  const handleSave = async (input: MemeInput) => {
    const fileName = `crew-awards-${input.kind}.png`;
    setActiveSource('save');
    setSaveStatus(null);
    setBusyKey(`save-${input.kind}`);
    try {
      const blob = await renderMemePng(input);
      if (!blob) {
        setSaveStatus('failed');
        return;
      }
      const res = await platform.saveImage(blob, fileName);
      setSaveStatus(res === 'saved' ? 'saved' : 'failed');
    } catch {
      setSaveStatus('failed');
    } finally {
      setBusyKey(null);
    }
  };

  const handleShare = (input: MemeInput) => {
    const fileName = `crew-awards-${input.kind}.png`;
    const origin = platform.apiBase || (typeof window !== 'undefined' ? window.location.origin : '');
    const card = awardShareCard(view, input, origin);
    setActiveSource('share');
    setSaveStatus(null);
    setBusyKey(`share-${input.kind}`);
    void share({
      render: () => renderMemePng(input),
      text: card.text,
      fileName,
      card,
      pcPicture: true,
    }).finally(() => {
      setBusyKey(null);
    });
  };

  const renderActions = (input: MemeInput, primaryShare: boolean) => {
    const kind: MemeKind = input.kind;
    return (
      <>
        <Button
          variant="secondary"
          data-testid={`save-${kind}`}
          loading={busyKey === `save-${kind}`}
          onClick={() => void handleSave(input)}
          className="min-h-11"
        >
          <Icon name="download" size={16} />
          <span>{t('awards.save')}</span>
        </Button>
        <Button
          variant={primaryShare ? 'primary' : 'secondary'}
          data-testid={`share-${kind}`}
          loading={sharing && busyKey === `share-${kind}`}
          onClick={() => handleShare(input)}
          className="min-h-11"
        >
          <Icon name="share" size={16} />
          <span>{t('awards.share')}</span>
        </Button>
      </>
    );
  };

  let primaryAssigned = false;
  const takePrimary = () => {
    if (primaryAssigned) return false;
    primaryAssigned = true;
    return true;
  };

  return (
    <Screen title={t('awards.title')} onBack={goBack}>
      <div className="fsl-awards flex flex-col gap-6 py-4" data-testid="crew-awards-screen">
        {status !== null && (
          <p
            className={
              status === 'failed'
                ? 'fsl-awards__status m-0 text-sm text-danger'
                : 'fsl-awards__status m-0 text-sm text-primary'
            }
            role={status === 'failed' ? 'alert' : 'status'}
          >
            {status === 'copied'
              ? t('request.copied')
              : status === 'saved'
                ? t('awards.saved')
                : activeSource === 'save'
                  ? t('awards.saveFailed')
                  : t('awards.shareFailed')}
          </p>
        )}

        {content.awards && (
          <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <h2 className="m-0 text-sm font-semibold text-muted-foreground">
              {t('awards.cardTitle.awards')}
            </h2>
            <AwardNightCard input={content.awards} actions={renderActions(content.awards, takePrimary())} />
          </section>
        )}

        {wantedInput && (
          <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <h2 className="m-0 text-sm font-semibold text-muted-foreground">
              {t('awards.cardTitle.wanted')}
            </h2>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('awards.cardTitle.wanted')}>
              {wantedCandidates.map((cid) => {
                const name = nameMap.get(cid);
                if (!name) return null;
                const selected = cid === wantedId;
                return (
                  <Button
                    key={cid}
                    variant={selected ? 'primary' : 'secondary'}
                    data-testid={`wanted-pick-${cid}`}
                    aria-pressed={selected}
                    onClick={() => setPickedWantedId(cid)}
                    className="min-h-11 rounded-full px-4"
                  >
                    {name}
                  </Button>
                );
              })}
            </div>
            <WantedCard input={wantedInput} actions={renderActions(wantedInput, takePrimary())} />
          </section>
        )}

        {content.verse && (
          <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <h2 className="m-0 text-sm font-semibold text-muted-foreground">
              {t('awards.cardTitle.verse')}
            </h2>
            <VerseCard input={content.verse} actions={renderActions(content.verse, takePrimary())} />
          </section>
        )}

        {content.board && (
          <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <h2 className="m-0 text-sm font-semibold text-muted-foreground">
              {t('awards.cardTitle.board')}
            </h2>
            <BoardCard input={content.board} actions={renderActions(content.board, takePrimary())} />
          </section>
        )}

        {sheet}
      </div>
    </Screen>
  );
}
