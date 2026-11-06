import type { JSX } from 'react';
import { useT } from '@cc/web-i18n';
import { useMe } from '@cc/web-data-access/hooks';
import { useLedger } from '@cc/web-data-access/people';
import { Screen } from '../components/Screen';
import { AccountMenu } from '../components/AccountMenu';
import { FeedbackButton } from '../components/FeedbackButton';
import { ConsentSheet } from '../components/ConsentSheet';
import { MyTrips } from './MyTrips';

export function Groups(): JSX.Element {
  const t = useT();
  const meQuery = useMe();
  const user = meQuery.data?.user;
  const { ledger } = useLedger();

  const addHref = ledger ? `/t/${ledger.tripId}/expenses/new` : '/trips';

  return (
    <Screen
      title={t('trips.title')}
      right={
        user ? (
          <>
            <FeedbackButton signedIn />
            <AccountMenu user={user} />
          </>
        ) : undefined
      }
      // Signed-out visitors get no nav: MyTrips sends them to the start page.
      nav={user ? { section: 'groups', addHref } : undefined}
    >
      <ConsentSheet />
      <MyTrips embedded />
    </Screen>
  );
}
