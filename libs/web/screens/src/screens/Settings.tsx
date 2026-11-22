import { useState, useId, useEffect } from 'react';
import { useNavigate, Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { can, isThemeId, type ThemeId } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { useTrip } from '../lib/tripBase';
import { useBack } from '../lib/navHistory';
import { actorOf } from '../lib/rowActions';
import { useTripView } from '@cc/web-data-access/hooks';
import { useSetGroupTheme } from '@cc/web-data-access/theme';
import { useCancelTripDelete } from '@cc/web-data-access/tripDelete';
import { apiSend, type ApiClientError } from '@cc/web-data-access/client';
import { Screen } from '../components/Screen';
import { ThemePicker } from '../components/ThemePicker';
import { DeleteGroupSheet } from '../components/DeleteGroupSheet';
import { DeletePendingBanner } from '../components/DeletePendingBanner';
import { Button } from '@cc/web-ui/components/Button';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Snackbar } from '@cc/web-ui/components/Snackbar';
import { Icon } from '@cc/web-ui/components/icons';
import { FewestSwitch } from '../components/FewestSwitch';
import { RoundTransfersSwitch } from '../components/RoundTransfersSwitch';
import { RatingsSwitch } from '../components/RatingsSwitch';
import { cn } from '@cc/web-ui/lib/utils';

const DANGER_OUTLINE_CLASS =
  'min-h-11 bg-card text-danger border border-danger hover:bg-danger-soft hover:border-danger hover:text-danger transition-colors duration-150 ease-out motion-reduce:transition-none';

export function Settings() {
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
  const [coloursOpen, setColoursOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState(false);
  const setGroupTheme = useSetGroupTheme(tripId ?? '');
  const cancelDelete = useCancelTripDelete(tripId ?? '');

  useEffect(() => {
    if (!cancelSuccess) return;
    const id = setTimeout(() => setCancelSuccess(false), 4000);
    return () => clearTimeout(id);
  }, [cancelSuccess]);

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
  const deleteAfter = view.trip.deleteAfter ?? null;
  const pendingDelete = Boolean(deleteAfter);
  const isDirect = view.trip.preset === 'direct';
  const hasUnsettled =
    view.suggestions.length > 0 || view.payments.some((p) => p.status === 'says_paid');
  const actor = actorOf(view);
  const canDelete = !isDirect && can(actor, 'delete_group');
  const canCancelDelete = !isDirect && can(actor, 'cancel_delete_group');
  const canSetTheme = can(actor, 'set_theme') && !view.trip.archived;
  const groupTheme: ThemeId | null = isThemeId(view.trip.theme) ? view.trip.theme : null;
  const groupThemeLabel = groupTheme ? t(`theme.name.${groupTheme}`) : t('theme.useOwnShort');

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
          {canSetTheme && (
            <li>
              <button
                type="button"
                className={cn(
                  'fsl-settings__row fsl-settings__colours w-full flex items-center justify-between gap-3 min-h-[52px] px-4 py-2 text-left text-foreground font-medium text-base no-underline bg-card transition-colors duration-150 ease-out hover:bg-muted cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none',
                )}
                onClick={() => {
                  setGroupTheme.reset();
                  setColoursOpen(true);
                }}
              >
                <span className="fsl-settings__label shrink-0">{t('theme.groupTitle')}</span>
                <span className="min-w-0 inline-flex items-center gap-2">
                  <span className="min-w-0 truncate text-right text-muted-foreground font-normal">{groupThemeLabel}</span>
                  <Icon name="chevronRight" size={20} className={cn('fsl-settings__chevron shrink-0 text-subtle-foreground')} />
                </span>
              </button>
            </li>
          )}
        </ul>

        {canSetTheme && (
          <ThemePicker
            open={coloursOpen}
            onClose={() => setColoursOpen(false)}
            title={t('theme.groupTitle')}
            explain={t('theme.groupExplain')}
            value={groupTheme}
            onChange={(theme) => setGroupTheme.mutate(theme)}
            noneLabel={t('theme.useOwn')}
            busy={setGroupTheme.isPending}
            error={setGroupTheme.error}
          />
        )}

        {view.me.kind === 'member' && !view.trip.archived && (
          <FewestSwitch view={view} />
        )}

        {view.me.kind === 'member' && !view.trip.archived && (
          <RoundTransfersSwitch view={view} />
        )}

        {view.trip.preset === 'sport' && !view.trip.archived && can(actorOf(view), 'manage_ratings') && (
          <RatingsSwitch view={view} />
        )}

        {archived && pendingDelete && deleteAfter ? (
          <>
            <DeletePendingBanner
              tripId={tripId ?? ''}
              deleteAfter={deleteAfter}
              canCancel={false}
              showSpendingBookNote={view.me.kind === 'member'}
            />
            {canCancelDelete && (
              <div className={cn('fsl-settings__restore flex flex-col gap-2 mt-4')}>
                {cancelDelete.error && <InlineError error={cancelDelete.error} />}
                <Button
                  variant="secondary"
                  block
                  loading={cancelDelete.isPending}
                  onClick={() => {
                    setCancelSuccess(false);
                    cancelDelete.mutate(undefined, {
                      onSuccess: () => setCancelSuccess(true),
                    });
                  }}
                >
                  {t('settings.cancelDelete')}
                </Button>
                <p className={cn('fsl-settings__hint m-0 text-sm text-muted-foreground')}>
                  {t('settings.cancelDeleteHint')}
                </p>
              </div>
            )}
          </>
        ) : archived ? (
          <>
            <div className={cn('fsl-notice fsl-notice--muted p-3 text-sm rounded-xl text-center bg-muted text-muted-foreground')}>
              {t('settings.archived')}
            </div>
            {view.me.isOrganiser && !isDirect && (
              <>
                <div className={cn('fsl-settings__restore flex flex-col gap-2 mt-4')}>
                  <Button variant="secondary" block loading={archiving} onClick={handleArchive}>
                    {t('settings.unarchive')}
                  </Button>
                  <p className={cn('fsl-settings__hint m-0 text-sm text-muted-foreground')}>{t('settings.unarchiveHint')}</p>
                </div>
                {canDelete && (
                  <section className={cn('fsl-settings__danger flex flex-col gap-2 mt-4')} aria-labelledby={headingId}>
                    <h2 className={cn('fsl-settings__heading m-0 text-sm font-semibold text-muted-foreground')} id={headingId}>
                      {t('settings.dangerZone')}
                    </h2>
                    <Button
                      variant="secondary"
                      block
                      className={cn('fsl-settings__delete', DANGER_OUTLINE_CLASS)}
                      onClick={() => {
                        setCancelSuccess(false);
                        setDeleteOpen(true);
                      }}
                    >
                      {t('settings.deleteGroup')}
                    </Button>
                    <p className={cn('fsl-settings__hint m-0 text-sm text-muted-foreground')}>{t('settings.deleteGroupHint')}</p>
                    <DeleteGroupSheet
                      open={deleteOpen}
                      onClose={() => setDeleteOpen(false)}
                      tripId={tripId ?? ''}
                      tripName={view.trip.name}
                      hasUnsettled={hasUnsettled}
                      onScheduled={goBack}
                    />
                  </section>
                )}
              </>
            )}
          </>
        ) : view.me.isOrganiser && !isDirect ? (
          <section className={cn('fsl-settings__danger flex flex-col gap-2 mt-4')} aria-labelledby={headingId}>
            <h2 className={cn('fsl-settings__heading m-0 text-sm font-semibold text-muted-foreground')} id={headingId}>
              {t('settings.dangerZone')}
            </h2>
            <Button
              variant="secondary"
              block
              loading={archiving}
              className={cn('fsl-settings__archive', DANGER_OUTLINE_CLASS)}
              onClick={handleArchive}
            >
              {t('settings.archive')}
            </Button>
            <p className={cn('fsl-settings__hint m-0 text-sm text-muted-foreground')}>{t('settings.archiveHint')}</p>
          </section>
        ) : canLeave ? (
          <section className={cn('fsl-settings__danger flex flex-col gap-2 mt-4')} aria-labelledby={headingId}>
            <h2 className={cn('fsl-settings__heading m-0 text-sm font-semibold text-muted-foreground')} id={headingId}>
              {t('settings.dangerZone')}
            </h2>
            <Button
              variant="secondary"
              block
              loading={leaving}
              className={cn('fsl-settings__archive', DANGER_OUTLINE_CLASS)}
              onClick={handleLeave}
            >
              {t('settings.leave')}
            </Button>
            <p className={cn('fsl-settings__hint m-0 text-sm text-muted-foreground')}>{t('settings.leaveHint')}</p>
          </section>
        ) : null}
      </div>
      {cancelSuccess && <Snackbar message={t('settings.cancelDeleteSuccess')} />}
    </Screen>
  );
}
