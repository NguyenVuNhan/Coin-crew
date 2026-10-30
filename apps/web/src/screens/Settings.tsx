import { useState, useId } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { can } from '@fsl/core';
import { useT } from '../i18n';
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

export function Settings() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const t = useT();
  const headingId = useId();

  const { view, error, isLoading, refetch } = useTripView(tripId ?? '', 0);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<ApiClientError | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<ApiClientError | null>(null);

  if (isLoading) {
    return (
      <Screen title={t('settings.title')} back={`/t/${tripId}`}>
        <div className={cn('fsl-settings flex flex-col gap-4 py-4')}>
          <SkeletonList rows={4} />
        </div>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title={t('settings.title')} back={`/t/${tripId}`}>
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
      navigate(`/t/${tripId}`);
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
      navigate('/');
    } catch (err) {
      setLeaveError(err as ApiClientError);
      setLeaving(false);
    }
  };

  return (
    <Screen title={t('settings.title')} back={`/t/${tripId}`}>
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
              to={`/t/${tripId}/people`}
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
              to={`/t/${tripId}/activity`}
              className={cn(
                'fsl-settings__row flex items-center justify-between gap-3 min-h-[52px] px-4 py-2 text-foreground font-medium text-base no-underline bg-card transition-colors duration-150 ease-out hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none',
              )}
            >
              <span className="fsl-settings__label">{t('settings.activity')}</span>
              <Icon name="chevronRight" size={20} className={cn('fsl-settings__chevron shrink-0 text-subtle-foreground')} />
            </Link>
          </li>
        </ul>

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
