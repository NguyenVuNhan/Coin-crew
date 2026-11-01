import type { JSX } from 'react';
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { useT } from '../i18n';
import { useMe } from '../api/hooks';
import { useIsWide } from '../lib/media';
import { homeDetailsHref } from '../lib/detailsNav';
import { useLedger } from '../api/people';
import { useMyActivity } from '../api/myActivity';
import { activityLine, groupByDay, timeOf } from '../lib/activityText';
import { Screen } from '../components/Screen';
import { AccountMenu } from '../components/AccountMenu';
import { SkeletonList } from '../components/Skeleton';
import { InlineError } from '../components/InlineError';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/Button';
import { cn } from '@/lib/utils';

export function MyActivity(): JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const wide = useIsWide();
  const meQuery = useMe();
  const user = meQuery.data?.user;
  const { ledger } = useLedger({ enabled: Boolean(user) });
  const { items, isLoading: activityLoading, error, fetchNextPage, hasNextPage } = useMyActivity({ enabled: Boolean(user) });
  // Nothing is fetched before sign-in is known.
  const isLoading = activityLoading || !user;

  // Signed-out visitors go to the start page, as from the main screen.
  useEffect(() => {
    if (meQuery.isSuccess && user === null) navigate('/', { replace: true });
  }, [meQuery.isSuccess, user, navigate]);

  const addHref = ledger ? `/t/${ledger.tripId}/expenses/new` : '/trips';

  return (
    <Screen
      title={t('nav.activity')}
      right={<AccountMenu />}
      nav={user ? { section: 'activity', addHref } : undefined}
      className="fsl-my-activity"
    >
      <div className={cn('fsl-my-activity flex flex-col gap-4 py-4')}>
        {isLoading && !error && <SkeletonList rows={5} />}

        {error && <InlineError error={error} onRetry={() => fetchNextPage()} />}

        {!isLoading && !error && items.length === 0 && (
          <EmptyState icon="clock" title={t('activity.empty')} action={null} />
        )}

        {!isLoading && !error && items.length > 0 && (
          <>
            {groupByDay(items, new Date()).map((group) => (
              <section key={group.label} className={cn('fsl-activity__day flex flex-col gap-2')}>
                <h2 className={cn('fsl-activity__heading m-0 text-sm font-semibold text-muted-foreground')}>
                  {group.label}
                </h2>
                <ul className={cn('fsl-activity__list list-none m-0 p-0 bg-card rounded-xl border border-border divide-y divide-border overflow-hidden')}>
                  {group.items.map((item) => {
                    const expenseId = item.details?.expenseId ? String(item.details.expenseId) : undefined;
                    const paymentId = item.details?.paymentId ? String(item.details.paymentId) : undefined;
                    // Quick-expense lines open on the main screen: in its right column from 1024px, else as the details page.
                    const onHome = item.kind === 'direct' && wide;
                    const href = expenseId
                      ? onHome ? homeDetailsHref('expense', expenseId) : `/t/${item.tripId}/expenses/${expenseId}`
                      : paymentId
                        ? onHome ? homeDetailsHref('payment', paymentId) : `/t/${item.tripId}/payments/${paymentId}`
                        : undefined;

                    const rowContent = (
                      <>
                        <div className={cn('fsl-activity__line text-base font-medium text-foreground [overflow-wrap:anywhere]')}>
                          {activityLine(item, undefined, t, item.names)}
                        </div>
                        <div className={cn('fsl-activity__meta text-sm text-muted-foreground tabular-nums')}>
                          {item.kind === 'direct' ? t('nav.home') : item.tripName} · {timeOf(item.createdAt)}
                          {item.deviceShort ? (
                            <>
                              {' · '}
                              {t('activity.device')}{' '}
                              <code className={cn('fsl-activity__device font-mono text-xs text-muted-foreground')}>
                                {item.deviceShort}
                              </code>
                            </>
                          ) : null}
                        </div>
                      </>
                    );

                    return (
                      <li
                        key={item.id}
                        className={cn('fsl-activity__row', !href && 'flex flex-col gap-1 px-4 py-3 min-h-11')}
                      >
                        {href ? (
                          <Link
                            to={href}
                            className="flex flex-col gap-1 px-4 py-3 min-h-11 text-foreground no-underline hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors motion-reduce:transition-none"
                          >
                            {rowContent}
                          </Link>
                        ) : (
                          rowContent
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}

            {hasNextPage && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="ghost"
                  data-testid="activity-load-more"
                  onClick={() => fetchNextPage()}
                >
                  {t('activity.loadMore')}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Screen>
  );
}
