import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useT } from '../i18n';
import { useTripView } from '../api/hooks';
import { apiSend, type ApiClientError } from '../api/client';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { SkeletonList } from '../components/Skeleton';
import { InlineError } from '../components/InlineError';
import './Settings.css';

export function Settings() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const t = useT();

  const { view, error, isLoading, refetch } = useTripView(tripId ?? '', 0);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<ApiClientError | null>(null);

  if (isLoading) {
    return (
      <Screen title={t('settings.title')} back={`/t/${tripId}`}>
        <div className="fsl-settings">
          <SkeletonList rows={2} />
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

  if (!view) {
    return null;
  }

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

  return (
    <Screen title={t('settings.title')} back={`/t/${tripId}`}>
      <div className="fsl-settings">
        {archiveError && (
          <InlineError error={archiveError} onRetry={handleArchive} />
        )}

        <div className="fsl-card">
          <Link
            to={`/t/${tripId}/people`}
            className="fsl-settings__row"
          >
            <span>{t('settings.people')}</span>
            <svg
              className="fsl-settings__chevron"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
          <Link
            to={`/t/${tripId}/activity`}
            className="fsl-settings__row"
          >
            <span>{t('settings.activity')}</span>
            <svg
              className="fsl-settings__chevron"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        </div>

        {view.trip.archived ? (
          <div className="fsl-notice fsl-notice--muted">
            {t('settings.archived')}
          </div>
        ) : (
          view.me.isOrganiser && (
            <div className="fsl-settings__danger-zone">
              <Button
                variant="danger"
                block
                loading={archiving}
                onClick={handleArchive}
              >
                {t('settings.archive')}
              </Button>
            </div>
          )
        )}
      </div>
    </Screen>
  );
}
