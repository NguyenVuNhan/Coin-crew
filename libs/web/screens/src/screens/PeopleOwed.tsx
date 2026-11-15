import { useEffect, type JSX } from 'react';
import { useNavigate } from 'react-router';
import { useT } from '@cc/web-i18n';
import { useMe } from '@cc/web-data-access/hooks';
import { useLedger } from '@cc/web-data-access/people';
import { Screen } from '../components/Screen';
import { PeopleByPerson } from '../components/PeopleSummary';

export function PeopleOwed(): JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const meQuery = useMe();
  const user = meQuery.data?.user;
  const { ledger } = useLedger();

  useEffect(() => {
    if (meQuery.isSuccess && user === null) {
      navigate('/', { replace: true });
    }
  }, [meQuery.isSuccess, user, navigate]);

  return (
    <Screen
      title={t('book.peopleTitle')}
      back="/trips"
      nav={
        ledger
          ? { section: 'home', addHref: `/t/${ledger.tripId}/expenses/new` }
          : undefined
      }
    >
      <div className="fsl-people-owed flex flex-col gap-4 py-4">
        <PeopleByPerson />
      </div>
    </Screen>
  );
}
