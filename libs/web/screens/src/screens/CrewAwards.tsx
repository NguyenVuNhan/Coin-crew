import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import { can, type TripView } from '@cc/core';
import { useT } from '@cc/web-i18n';
import type { MessageKey } from '@cc/web-i18n/en';
import { useAttendance } from '@cc/web-data-access/attendance';
import { useTripView } from '@cc/web-data-access/hooks';
import { usePlatform, type ShareCard } from '@cc/web-platform';
import { renderMemePng, type MemeInput, type MemeKind } from '@cc/web-util/memeCards';
import { shareImageFile } from '@cc/web-util/qr';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Skeleton } from '@cc/web-ui/components/Skeleton';
import { cn } from '@cc/web-ui/lib/utils';
import { Screen } from '../components/Screen';
import { AwardNightCard } from '../components/meme/AwardNightCard';
import { WantedCard } from '../components/meme/WantedCard';
import { VerseCard } from '../components/meme/VerseCard';
import { BoardCard } from '../components/meme/BoardCard';
import { buildAwards } from '../lib/awards';
import { useBack } from '../lib/navHistory';
import { actorOf } from '../lib/rowActions';
import { clip, groupToken, thumbnailFor } from '../lib/shareCards';
import { useTrip } from '../lib/tripBase';

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

function awardShareCard(view: TripView, input: MemeInput, origin: string): ShareCard {
  const token = encodeURIComponent(groupToken(view));
  const path = token ? `j/${token}` : `t/${encodeURIComponent(view.trip.id)}`;
  const url = `${origin}/${path}`;
  return {
    title: clip(`${view.trip.name} · ${input.heading}`, 100),
    description: clip(input.footer, 400),
    path,
    thumbnailUrl: thumbnailFor(view, origin),
    text: `${view.trip.name} · ${input.heading}`,
    url,
  };
}

export function CrewAwards() {
  const t = useT();
  const platform = usePlatform();
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

  const content = useMemo(
    () => (attendance.data ? buildAwards(attendance.data, activePeople, t) : null),
    [attendance.data, activePeople, t],
  );

  const [pickedWantedId, setPickedWantedId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

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

  const hasAnyCard = Boolean(
    content && (content.awards || content.wantedCandidates.length > 0 || content.verse || content.board),
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
    pickedWantedId && content.wantedCandidates.includes(pickedWantedId)
      ? pickedWantedId
      : (content.wantedCandidates[0] ?? null);
  const wantedInput = wantedId ? content.wanted(wantedId) : null;

  const handleSave = async (input: MemeInput) => {
    const fileName = `crew-awards-${input.kind}.png`;
    setBusyKey(`save-${input.kind}`);
    try {
      const blob = (await renderMemePng(input)) ?? new Blob([''], { type: 'image/png' });
      await platform.saveImage(blob, fileName);
    } finally {
      setBusyKey(null);
    }
  };

  const handleShare = async (input: MemeInput) => {
    const fileName = `crew-awards-${input.kind}.png`;
    const card = awardShareCard(view, input, platform.apiBase || (typeof window !== 'undefined' ? window.location.origin : ''));
    setBusyKey(`share-${input.kind}`);
    try {
      const blob = await renderMemePng(input);
      if (platform.kind === 'zmp') {
        if (blob) await platform.saveImage(blob, fileName);
        await platform.share(card);
        return;
      }
      if (blob) {
        const res = await shareImageFile(blob, fileName, card.text);
        if (res === 'shared' || res === 'saved') return;
      }
      await platform.share(card);
    } finally {
      setBusyKey(null);
    }
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
          loading={busyKey === `share-${kind}`}
          onClick={() => void handleShare(input)}
          className="min-h-11"
        >
          <Icon name="share" size={16} />
          <span>{t('awards.share')}</span>
        </Button>
      </>
    );
  };

  const nameMap = new Map(activePeople.map((p) => [p.id, p.name]));
  let primaryAssigned = false;
  const takePrimary = () => {
    if (primaryAssigned) return false;
    primaryAssigned = true;
    return true;
  };

  return (
    <Screen title={t('awards.title')} onBack={goBack}>
      <div className="fsl-awards flex flex-col gap-6 py-4" data-testid="crew-awards-screen">
        {content.awards && (
          <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <h2 className="m-0 text-sm font-semibold text-muted-foreground">
              {t('awards.cardTitle.awards' as MessageKey)}
            </h2>
            <AwardNightCard input={content.awards} actions={renderActions(content.awards, takePrimary())} />
          </section>
        )}

        {wantedInput && (
          <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <h2 className="m-0 text-sm font-semibold text-muted-foreground">
              {t('awards.cardTitle.wanted' as MessageKey)}
            </h2>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('awards.cardTitle.wanted')}>
              {content.wantedCandidates.map((cid) => {
                const selected = cid === wantedId;
                return (
                  <button
                    key={cid}
                    type="button"
                    data-testid={`wanted-pick-${cid}`}
                    aria-pressed={selected}
                    onClick={() => setPickedWantedId(cid)}
                    className={cn(
                      'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full px-4 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      selected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground hover:bg-accent',
                    )}
                  >
                    {nameMap.get(cid) ?? cid}
                  </button>
                );
              })}
            </div>
            <WantedCard input={wantedInput} actions={renderActions(wantedInput, takePrimary())} />
          </section>
        )}

        {content.verse && (
          <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <h2 className="m-0 text-sm font-semibold text-muted-foreground">
              {t('awards.cardTitle.verse' as MessageKey)}
            </h2>
            <VerseCard input={content.verse} actions={renderActions(content.verse, takePrimary())} />
          </section>
        )}

        {content.board && (
          <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <h2 className="m-0 text-sm font-semibold text-muted-foreground">
              {t('awards.cardTitle.board' as MessageKey)}
            </h2>
            <BoardCard input={content.board} actions={renderActions(content.board, takePrimary())} />
          </section>
        )}
      </div>
    </Screen>
  );
}
