import { Navigate, Outlet, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useT } from '../i18n';
import { apiFetch } from '../api/client';
import { linkTokens } from '../lib/linkTokens';
import { TripBaseProvider } from '../lib/tripBase';
import { Screen } from '../components/Screen';
import { LanguageButton } from '../components/LanguageButton';
import { Skeleton } from '../components/Skeleton';
import { InlineError } from '../components/InlineError';

interface LinkResponse {
  tripId: string;
  tripName: string;
  access: 'group' | 'view';
}

/**
 * `/j/:token/*`: a guest's or view-only visitor's trip pages. The token in the address says which trip, and goes
 * with every request, so the address opens in any browser (Zalo reopening it in the phone's own one too).
 */
export function Join() {
  const { token } = useParams<{ token?: string }>();
  const t = useT();

  const { data, error } = useQuery<LinkResponse>({
    queryKey: ['link', token],
    queryFn: () => apiFetch<LinkResponse>(`/api/links/${token}`),
    enabled: Boolean(token),
    staleTime: Infinity,
  });

  if (error) {
    return (
      <Screen title={t('join.opening')} right={<LanguageButton />}>
        <InlineError error={error} />
      </Screen>
    );
  }

  if (!data || !token) {
    return (
      <Screen title={t('join.opening')} right={<LanguageButton />}>
        <div className="flex flex-col gap-3 py-4">
          <Skeleton height={56} radius="lg" />
          <p className="text-sm text-muted-foreground">
            {t('join.opening')}
          </p>
        </div>
      </Screen>
    );
  }

  // Saved while rendering, not in an effect: the pages below fetch from their own effects, which run before ours,
  // and the API client reads the token from here. Saving the same value again is harmless.
  linkTokens.set(data.tripId, token);

  return (
    <TripBaseProvider tripId={data.tripId} token={token}>
      <Outlet />
    </TripBaseProvider>
  );
}

/** `/j/:token/e/:expenseId`, the address reminders and shared bills use: the expense's page under the link. */
export function OldExpenseLink() {
  const { token, expenseId } = useParams<{ token: string; expenseId: string }>();
  return <Navigate to={`/j/${token}/expenses/${encodeURIComponent(expenseId ?? '')}`} replace />;
}
