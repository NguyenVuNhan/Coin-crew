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
import './Settings.css';

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
        <div className="fsl-settings">
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

  const handleArchive = async () => {
    if (!window.confirm(t('settings.archiveConfirm'))) return;
    setArchiving(true);
    setArchiveError(null);
    try {
      await apiSend(`/api/trips/${tripId}/archive`, 'POST', undefined, tripId);
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
      <div className="fsl-settings">
        {archiveError && (
          <InlineError error={archiveError} onRetry={handleArchive} />
        )}
        {leaveError && (
          <InlineError error={leaveError} onRetry={handleLeave} />
        )}

        <ul className="fsl-settings__list">
          <li>
            <Link to={`/t/${tripId}/people`} className="fsl-settings__row">
              <span className="fsl-settings__label">{t('settings.people')}</span>
              <Icon name="chevronRight" size={20} className="fsl-settings__chevron" />
            </Link>
          </li>
          <li>
            <Link to={`/t/${tripId}/activity`} className="fsl-settings__row">
              <span className="fsl-settings__label">{t('settings.activity')}</span>
              <Icon name="chevronRight" size={20} className="fsl-settings__chevron" />
            </Link>
          </li>
        </ul>

        {view.me.kind === 'member' && !view.trip.archived && (
          <FewestSwitch view={view} />
        )}

        {view.trip.archived ? (
          <div className="fsl-notice fsl-notice--muted">
            {t('settings.archived')}
          </div>
        ) : view.me.isOrganiser ? (
          <section className="fsl-settings__danger" aria-labelledby={headingId}>
            <h2 className="fsl-settings__heading" id={headingId}>
              {t('settings.dangerZone')}
            </h2>
            <Button
              variant="secondary"
              block
              loading={archiving}
              className="fsl-settings__archive"
              onClick={handleArchive}
            >
              {t('settings.archive')}
            </Button>
            <p className="fsl-settings__hint">{t('settings.archiveHint')}</p>
          </section>
        ) : canLeave ? (
          <section className="fsl-settings__danger" aria-labelledby={headingId}>
            <h2 className="fsl-settings__heading" id={headingId}>
              {t('settings.dangerZone')}
            </h2>
            <Button
              variant="secondary"
              block
              loading={leaving}
              className="fsl-settings__archive"
              onClick={handleLeave}
            >
              {t('settings.leave')}
            </Button>
            <p className="fsl-settings__hint">{t('settings.leaveHint')}</p>
          </section>
        ) : null}
      </div>
    </Screen>
  );
}
