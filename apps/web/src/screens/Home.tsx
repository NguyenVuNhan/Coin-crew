import type { JSX } from 'react';
import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { PersonSummary } from '@fsl/core';
import { useT } from '../i18n';
import { useMe } from '../api/hooks';
import { useLedger, usePeopleSummary } from '../api/people';
import { Screen } from '../components/Screen';
import { AccountMenu } from '../components/AccountMenu';
import { ConsentSheet } from '../components/ConsentSheet';
import { Button } from '../components/Button';
import { Avatar } from '../components/Avatar';
import { Amount } from '../components/Amount';
import { EmptyState } from '../components/EmptyState';
import { SkeletonList } from '../components/Skeleton';
import { InlineError } from '../components/InlineError';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MyTrips } from './MyTrips';
import { Activity } from './Activity';
import { cn } from '@/lib/utils';

export function Home(): JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const meQuery = useMe();
  const user = meQuery.data?.user;

  const { ledger } = useLedger();
  const {
    people,
    incomplete,
    isLoading: peopleLoading,
    error: peopleError,
    refetch: refetchPeople,
  } = usePeopleSummary();

  const [searchParams] = useSearchParams();
  const defaultTab =
    searchParams.get('mergeReview') || searchParams.get('tab') === 'groups'
      ? 'groups'
      : searchParams.get('tab') === 'activity'
        ? 'activity'
        : 'people';

  useEffect(() => {
    if (meQuery.isSuccess && user === null) {
      navigate('/', { replace: true });
    }
  }, [meQuery.isSuccess, user, navigate]);

  const owedToYou = (people ?? [])
    .filter((p) => p.total > 0)
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  const youOwe = (people ?? [])
    .filter((p) => p.total < 0)
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  const isEmpty = owedToYou.length === 0 && youOwe.length === 0;

  const renderPersonRow = (p: PersonSummary) => {
    const hasSecondLine = p.groupLabel !== null || p.waiting.length > 0;

    return (
      <Link
        key={p.key}
        to={`/people/${encodeURIComponent(p.key)}`}
        data-testid={`person-row-${p.key}`}
        className="fsl-home__person flex items-center gap-3 px-4 py-3 min-h-[56px] border-b border-border last:border-b-0 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors motion-reduce:transition-none text-foreground"
      >
        <Avatar name={p.name} />
        <div className="fsl-home__person-info flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="fsl-home__person-name truncate text-base leading-snug">
            <span className="font-semibold text-foreground">{p.name}</span>
            {p.nickname ? (
              <span className="text-muted-foreground font-normal">
                {` "${p.nickname}"`}
              </span>
            ) : null}
          </div>
          {hasSecondLine && (
            <div className="fsl-home__person-sub text-sm text-muted-foreground truncate leading-snug">
              {p.groupLabel !== null && <span>{p.groupLabel}</span>}
              {p.groupLabel !== null && p.waiting.length > 0 && <span> · </span>}
              {p.waiting.length > 0 && <span>{t('home.waiting')}</span>}
            </div>
          )}
        </div>
        <span
          className={cn(
            'fsl-home__amount tabular-nums font-semibold shrink-0',
            p.total > 0 ? 'text-success' : 'text-danger',
          )}
        >
          {p.total > 0 ? '+' : '−'}
          <Amount
            value={Math.abs(p.total)}
            tone={p.total > 0 ? 'success' : 'danger'}
          />
        </span>
      </Link>
    );
  };

  return (
    <Screen
      title={t('home.title')}
      right={user ? <AccountMenu user={user} /> : undefined}
    >
      <ConsentSheet />
      <div className="fsl-home flex flex-col gap-4 py-4">
        <Tabs defaultValue={defaultTab} className="flex flex-col gap-4">
          <TabsList
            aria-label={t('home.title')}
            className="fsl-home__tabs flex w-full items-center bg-muted rounded-full p-1 gap-1 h-auto"
          >
            <TabsTrigger
              value="people"
              data-testid="home-tab-people"
              className="fsl-home__tab flex-1 min-w-0 min-h-11 flex items-center justify-center rounded-full px-3 text-sm font-medium text-muted-foreground cursor-pointer transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-active:bg-card data-active:text-foreground data-active:shadow-sm data-active:font-semibold"
            >
              {t('home.tabPeople')}
            </TabsTrigger>
            <TabsTrigger
              value="groups"
              data-testid="home-tab-groups"
              className="fsl-home__tab flex-1 min-w-0 min-h-11 flex items-center justify-center rounded-full px-3 text-sm font-medium text-muted-foreground cursor-pointer transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-active:bg-card data-active:text-foreground data-active:shadow-sm data-active:font-semibold"
            >
              {t('home.tabGroups')}
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              data-testid="home-tab-activity"
              className="fsl-home__tab flex-1 min-w-0 min-h-11 flex items-center justify-center rounded-full px-3 text-sm font-medium text-muted-foreground cursor-pointer transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-active:bg-card data-active:text-foreground data-active:shadow-sm data-active:font-semibold"
            >
              {t('home.tabActivity')}
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="people"
            className="fsl-home__tab-content fsl-home__tab-content--people flex flex-col gap-4 mt-0 outline-none"
          >
            {ledger && (
              <Button
                variant="primary"
                block
                data-testid="home-new-expense"
                href={`/t/${ledger.tripId}/expenses/new`}
              >
                {t('home.newExpense')}
              </Button>
            )}
            <Button variant="secondary" block href="/trips/new">
              {t('trips.new')}
            </Button>

            {peopleLoading ? (
              <SkeletonList rows={3} />
            ) : peopleError ? (
              <InlineError error={peopleError} onRetry={refetchPeople} />
            ) : isEmpty ? (
              <>
                <EmptyState
                  icon="users"
                  title={t('home.peopleEmptyTitle')}
                  action={
                    <p className="fsl-home__empty-body m-0 text-base text-muted-foreground">
                      {t('home.peopleEmptyBody')}
                    </p>
                  }
                />
                {incomplete && (
                  <p className="fsl-home__still-counting m-0 px-1 text-sm text-muted-foreground text-center">
                    {t('home.stillCounting')}
                  </p>
                )}
              </>
            ) : (
              <div className="fsl-home__people-sections flex flex-col gap-4">
                {owedToYou.length > 0 && (
                  <section className="fsl-home__section flex flex-col gap-2">
                    <h2 className="fsl-home__heading m-0 px-1 text-sm font-semibold text-muted-foreground">
                      {t('home.owedToYou')}
                    </h2>
                    <div className="fsl-home__list bg-card border border-border rounded-xl overflow-hidden">
                      {owedToYou.map(renderPersonRow)}
                    </div>
                  </section>
                )}
                {youOwe.length > 0 && (
                  <section className="fsl-home__section flex flex-col gap-2">
                    <h2 className="fsl-home__heading m-0 px-1 text-sm font-semibold text-muted-foreground">
                      {t('home.youOwe')}
                    </h2>
                    <div className="fsl-home__list bg-card border border-border rounded-xl overflow-hidden">
                      {youOwe.map(renderPersonRow)}
                    </div>
                  </section>
                )}
                {incomplete && (
                  <p className="fsl-home__still-counting m-0 px-1 text-sm text-muted-foreground text-center">
                    {t('home.stillCounting')}
                  </p>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent
            value="groups"
            className="fsl-home__tab-content fsl-home__tab-content--groups mt-0 outline-none"
          >
            <MyTrips embedded />
          </TabsContent>

          <TabsContent
            value="activity"
            className="fsl-home__tab-content fsl-home__tab-content--activity mt-0 outline-none"
          >
            {ledger ? (
              <Activity tripId={ledger.tripId} embedded />
            ) : (
              <SkeletonList rows={3} />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Screen>
  );
}
