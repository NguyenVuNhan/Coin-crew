import { useEffect, type JSX } from 'react';
import { useNavigate } from 'react-router';
import { useT } from '@cc/web-i18n';
import { useGroupPersonHistory, useLedger } from '@cc/web-data-access/people';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { Screen } from '../components/Screen';

/** `/people/in/:tripId/:pid`: lands on the canonical person page with that group's sheet open. */
export function PersonGroupHistory({ tripId, pid }: { tripId: string; pid: string }): JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const { ledger } = useLedger();
  const nav = { section: 'home' as const, addHref: ledger ? `/t/${ledger.tripId}/expenses/new` : '/trips' };
  const back = `/t/${tripId}`;

  const { data, error, refetch } = useGroupPersonHistory(tripId, pid);
  const key = data?.key;

  useEffect(() => {
    if (!key) return;
    void navigate(`/people/${encodeURIComponent(key)}?open=${encodeURIComponent(tripId)}`, { replace: true });
  }, [key, tripId, navigate]);

  return (
    <Screen title={t('person.title')} back={back} nav={nav}>
      {error ? <InlineError error={error} onRetry={() => void refetch()} /> : <SkeletonList rows={3} />}
    </Screen>
  );
}
