import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useT } from '../i18n';
import { apiFetch } from '../api/client';
import { linkTokens } from '../lib/linkTokens';
import { Screen } from '../components/Screen';
import { LanguageButton } from '../components/LanguageButton';
import { Skeleton } from '../components/Skeleton';
import { InlineError } from '../components/InlineError';

interface LinkResponse {
  tripId: string;
  tripName: string;
  access: 'group' | 'view';
}

export function Join() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const t = useT();

  const linkQuery = useQuery<LinkResponse>({
    queryKey: ['link', token],
    queryFn: () => apiFetch<LinkResponse>(`/api/links/${token}`),
    enabled: Boolean(token),
  });

  const { data, error } = linkQuery;

  useEffect(() => {
    if (data && token) {
      linkTokens.set(data.tripId, token);
      if (data.access === 'group') {
        navigate(`/t/${data.tripId}/who`, { replace: true });
      } else {
        navigate(`/t/${data.tripId}`, { replace: true });
      }
    }
  }, [data, token, navigate]);

  if (error) {
    return (
      <Screen title={t('join.opening')} right={<LanguageButton />}>
        <InlineError error={error} />
      </Screen>
    );
  }

  return (
    <Screen title={t('join.opening')} right={<LanguageButton />}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-4) 0' }}>
        <Skeleton height={56} radius="lg" />
        <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
          {t('join.opening')}
        </p>
      </div>
    </Screen>
  );
}
