import { useState, useId } from 'react';
import { useNavigate, Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { can } from '@fsl/core';
import { useT } from '../i18n';
import { useTrip } from '../lib/tripBase';
import { useBack } from '../lib/navHistory';
import { actorOf } from '../lib/rowActions';
import { useTripView } from '../api/hooks';
import { apiSend, type ApiClientError } from '../api/client';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { SkeletonList } from '../components/Skeleton';
import { InlineError } from '../components/InlineError';
import { Icon } from '../components/icons';
import { FewestSwitch } from '../components/FewestSwitch';
import { RatingsSwitch } from '../components/RatingsSwitch';
import { cn } from '@/lib/utils';
import { usePlatform } from '../platform';
import { useTripZaloChats, unlinkZaloChat } from '../api/zaloChats';

export function Settings() {
  const platform = usePlatform();
  const { tripId, href } = useTrip();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const t = useT();
  const headingId = useId();
  const { goBack } = useBack(href());

  const { view, error, isLoading, refetch } = useTripView(tripId ?? '', 0);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<ApiClientError | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<ApiClientError | null>(null);

  const isZmpAdmin = platform.kind === 'zmp' && (view?.me.isAdmin === true || view?.me.isOrganiser === true);
  const zaloChatsQuery = useTripZaloChats(tripId ?? '', isZmpAdmin);
  const [unlinkingChatId, setUnlinkingChatId] = useState<string | null>(null);

  const handleUnlink = async (chatId: string) => {
    setUnlinkingChatId(chatId);
    try {
      await unlinkZaloChat(chatId);
      await zaloChatsQuery.refetch();
    } catch {
      // ignore
    } finally {
      setUnlinkingChatId(null);
    }
  };

  if (isLoading) {
    return (
      <Screen title={t('settings.title')} back={href()}>
        <div className={cn('fsl-settings flex flex-col gap-4 py-4')}>
          <SkeletonList rows={4} />
        </div>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title={t('settings.title')} back={href()}>
        <InlineError error={error} onRetry={refetch} />
      </Screen>
    );
  }

  if (!view) return null;

  const archived = view.trip.archived;

  // Archiving asks first; unarchiving loses nothing, so it doesn't.
  const handleArchive = async () => {
    if (!archived && !window.confirm(t('settings.archiveConfirm'))) return;
    setArchiving(true);
    setArchiveError(null);
    try {
      await apiSend(`/api/trips/${tripId}/${archived ? 'unarchive' : 'archive'}`, 'POST', undefined, tripId);
      await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
      goBack();
    } catch (err) {
      setArchiveError(err as ApiClientError);
      setArchiving(false);
    }
  };

  // Anyone but the organiser can leave; the group then drops out of their list, so they go back to it.
  const canLeave = can(actorOf(view), 'leave');
  const handleLeave = async () => {
    if (!window.confirm(t('settings.leaveConfirm', { group: view.trip.name }))) return;
    setLeaving(true);
    setLeaveError(null);
    try {
      await apiSend(`/api/trips/${tripId}/leave`, 'POST', undefined, tripId);
      queryClient.resetQueries();
      navigate('/', { replace: true });
    } catch (err) {
      setLeaveError(err as ApiClientError);
      setLeaving(false);
    }
  };

  return (
    <Screen title={t('settings.title')} back={href()}>
      <div className={cn('fsl-settings flex flex-col gap-4 py-4')}>
        {archiveError && (
          <InlineError error={archiveError} onRetry={handleArchive} />
        )}
        {leaveError && (
          <InlineError error={leaveError} onRetry={handleLeave} />
        )}

        <ul className={cn('fsl-settings__list list-none m-0 p-0 bg-card border border-border rounded-xl overflow-hidden divide-y divide-border')}>
          <li>
            <Link
              to={href('/people')}
              className={cn(
                'fsl-settings__row flex items-center justify-between gap-3 min-h-[52px] px-4 py-2 text-foreground font-medium text-base no-underline bg-card transition-colors duration-150 ease-out hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none',
              )}
            >
              <span className="fsl-settings__label">{t('settings.people')}</span>
              <Icon name="chevronRight" size={20} className={cn('fsl-settings__chevron shrink-0 text-subtle-foreground')} />
            </Link>
          </li>
          <li>
            <Link
              to={href('/activity')}
              className={cn(
                'fsl-settings__row flex items-center justify-between gap-3 min-h-[52px] px-4 py-2 text-foreground font-medium text-base no-underline bg-card transition-colors duration-150 ease-out hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none',
              )}
            >
              <span className="fsl-settings__label">{t('settings.activity')}</span>
              <Icon name="chevronRight" size={20} className={cn('fsl-settings__chevron shrink-0 text-subtle-foreground')} />
            </Link>
          </li>
        </ul>

        {isZmpAdmin && (zaloChatsQuery.data?.chats?.length ?? 0) > 0 && (
          <section className="fsl-settings__zalo-chats flex flex-col gap-2">
            <h2 className={cn('fsl-settings__heading m-0 text-xs font-bold uppercase tracking-wider text-muted-foreground')}>
              {t('settings.zaloChats')}
            </h2>
            <ul className={cn('fsl-settings__list list-none m-0 p-0 bg-card border border-border rounded-xl overflow-hidden divide-y divide-border')}>
              {zaloChatsQuery.data!.chats.map((c) => (
                <li
                  key={c.chatId}
                  className="fsl-settings__zalo-chat flex items-center justify-between gap-3 min-h-[52px] px-4 py-2 bg-card"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium text-foreground">{t('zaloChat.linked')}</span>
                    <span className="text-muted-foreground text-sm">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    disabled={unlinkingChatId === c.chatId}
                    loading={unlinkingChatId === c.chatId}
                    className="fsl-settings__zalo-unlink min-h-11 text-danger hover:text-danger hover:bg-danger-soft shrink-0"
                    onClick={() => handleUnlink(c.chatId)}
                  >
                    {t('zaloChat.unlink')}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {platform.kind === 'zmp' && (
          <p className="fsl-settings__zalo-hint m-0 px-1 text-sm text-muted-foreground">{t('settings.zaloChatHint')}</p>
        )}

        {view.me.kind === 'member' && !view.trip.archived && (
          <FewestSwitch view={view} />
        )}

        {view.trip.preset === 'sport' && !view.trip.archived && can(actorOf(view), 'manage_ratings') && (
          <RatingsSwitch view={view} />
        )}

        {archived ? (
          <>
            <div className={cn('fsl-notice fsl-notice--muted p-3 text-sm rounded-xl text-center bg-muted text-muted-foreground')}>
              {t('settings.archived')}
            </div>
            {view.me.isOrganiser && (
              <div className={cn('fsl-settings__restore flex flex-col gap-2 mt-4')}>
                <Button variant="secondary" block loading={archiving} onClick={handleArchive}>
                  {t('settings.unarchive')}
                </Button>
                <p className={cn('fsl-settings__hint m-0 text-sm text-muted-foreground')}>{t('settings.unarchiveHint')}</p>
              </div>
            )}
          </>
        ) : view.me.isOrganiser ? (
          <section className={cn('fsl-settings__danger flex flex-col gap-2 mt-4')} aria-labelledby={headingId}>
            <h2 className={cn('fsl-settings__heading m-0 text-xs font-bold uppercase tracking-wider text-muted-foreground')} id={headingId}>
              {t('settings.dangerZone')}
            </h2>
            <Button
              variant="secondary"
              block
              loading={archiving}
              className={cn('fsl-settings__archive bg-card text-danger border border-danger hover:bg-danger-soft hover:border-danger hover:text-danger transition-colors duration-150 ease-out motion-reduce:transition-none')}
              onClick={handleArchive}
            >
              {t('settings.archive')}
            </Button>
            <p className={cn('fsl-settings__hint m-0 text-sm text-muted-foreground')}>{t('settings.archiveHint')}</p>
          </section>
        ) : canLeave ? (
          <section className={cn('fsl-settings__danger flex flex-col gap-2 mt-4')} aria-labelledby={headingId}>
            <h2 className={cn('fsl-settings__heading m-0 text-xs font-bold uppercase tracking-wider text-muted-foreground')} id={headingId}>
              {t('settings.dangerZone')}
            </h2>
            <Button
              variant="secondary"
              block
              loading={leaving}
              className={cn('fsl-settings__archive bg-card text-danger border border-danger hover:bg-danger-soft hover:border-danger hover:text-danger transition-colors duration-150 ease-out motion-reduce:transition-none')}
              onClick={handleLeave}
            >
              {t('settings.leave')}
            </Button>
            <p className={cn('fsl-settings__hint m-0 text-sm text-muted-foreground')}>{t('settings.leaveHint')}</p>
          </section>
        ) : null}
      </div>
    </Screen>
  );
}
