import type { JSX } from 'react';
import { useT } from '../i18n';
import { useMe } from '../api/hooks';
import { useLedger } from '../api/people';
import { Screen } from '../components/Screen';
import { AccountMenu } from '../components/AccountMenu';
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
      right={user ? <AccountMenu user={user} /> : undefined}
      nav={{ section: 'groups', addHref }}
    >
      <ConsentSheet />
      <MyTrips embedded />
    </Screen>
  );
}
