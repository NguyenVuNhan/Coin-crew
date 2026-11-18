import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router';
import type { ReactNode } from 'react';
import { useMe, usePersonalArea } from '@cc/web-data-access/hooks';
import { Placeholder } from './screens/Placeholder';
import { Landing } from './screens/Landing';
import { MainScreen } from './screens/SpendingBook';
import { PeopleOwed } from './screens/PeopleOwed';
import { WalletsScreen } from './screens/WalletsScreen';
import { WalletScreen } from './screens/WalletScreen';
import { EntryPage } from './screens/EntryPage';
import { TransactionsScreen } from './screens/TransactionsScreen';
import { TransactionDetail } from './screens/TransactionDetail';
import { CategoriesScreen } from './screens/CategoriesScreen';
import { AssetsScreen } from './screens/AssetsScreen';
import { TagsScreen } from './screens/TagsScreen';
import { Groups } from './screens/Groups';
import { MyActivity } from './screens/MyActivity';
import { PersonScreen } from './screens/PersonScreen';
import { RequestPage } from './screens/RequestPage';
import { CreateTrip } from './screens/CreateTrip';
import { Privacy } from './screens/Privacy';
import { Join, OldExpenseLink } from './screens/Join';
import { TripRoute } from './screens/TripRoute';
import { WhoAreYou } from './screens/WhoAreYou';
import { ExpenseForm } from './screens/ExpenseForm';
import { Settings } from './screens/Settings';
import { People } from './screens/People';
import { Activity } from './screens/Activity';
import { PayScreen } from './screens/PayScreen';
import { OweScreen } from './screens/OweScreen';
import { ExpensePay } from './screens/ExpensePay';
import { BankDetails } from './screens/BankDetails';
import { GuestBank } from './screens/GuestBank';
import { CrewAwards } from './screens/CrewAwards';
import { AuthNotice } from './components/AuthNotice';
import { UndoSnackbarHost } from './components/UndoSnackbarHost';
import { ThemeController } from './components/ThemeController';
import { GroupThemeScope } from './lib/groupTheme';
import { GuestGate } from './components/GuestGate';

function TripsRoute() {
  const { search } = useLocation();
  const personalArea = usePersonalArea();
  const params = new URLSearchParams(search);
  if (params.has('mergeReview') || params.get('tab') === 'groups') {
    return <Navigate to={{ pathname: '/groups', search }} replace />;
  }
  return <MainScreen book={personalArea} />;
}

function PersonalRoute({ children }: { children: ReactNode }) {
  const personalArea = usePersonalArea();
  const me = useMe();
  // On a phone with no remembered setting, wait for the server's answer before sending anyone away.
  if (!personalArea && me.isPending) return null;
  return personalArea ? <>{children}</> : <Navigate to="/trips" replace />;
}

/** A trip's pages, mounted under `/t/:tripId` (members) and `/j/:token` (guests and view-only links). */
const tripPages = (
  <>
    <Route index element={<TripRoute />} />
    <Route path="who" element={<WhoAreYou />} />
    <Route path="expenses/new" element={<ExpenseForm />} />
    <Route path="expenses/:expenseId/edit" element={<ExpenseForm />} />
    <Route path="fund/:incomeId/edit" element={<ExpenseForm />} />
    <Route path="expenses/:expenseId/pay" element={<ExpensePay />} />
    <Route path="expenses/:expenseId" element={<TripRoute />} />
    <Route path="payments/:paymentId" element={<TripRoute />} />
    <Route path="fund/:incomeId" element={<TripRoute />} />
    <Route path="approvals" element={<TripRoute />} />
    <Route path="ratings" element={<TripRoute />} />
    <Route path="awards" element={<CrewAwards />} />
    <Route path="owe" element={<OweScreen />} />
    <Route path="pay/:toId" element={<PayScreen />} />
    <Route path="bank" element={<BankDetails />} />
    <Route path="people" element={<People />} />
    <Route path="people/:pid/bank" element={<GuestBank />} />
    <Route path="activity" element={<Activity />} />
    <Route path="settings" element={<Settings />} />
  </>
);

export function App() {
  return (
    <>
      <AuthNotice />
      <ThemeController />
      <UndoSnackbarHost />
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/trips" element={<TripsRoute />} />
      <Route path="/groups" element={<Groups />} />
      <Route path="/activity" element={<MyActivity />} />
      <Route path="/trips/new" element={<CreateTrip />} />
      <Route path="/people" element={<PersonalRoute><PeopleOwed /></PersonalRoute>} />
      <Route path="/wallets" element={<PersonalRoute><WalletsScreen /></PersonalRoute>} />
      <Route path="/wallets/:id" element={<PersonalRoute><WalletScreen /></PersonalRoute>} />
      <Route path="/transactions" element={<PersonalRoute><TransactionsScreen /></PersonalRoute>} />
      <Route path="/entries/new" element={<PersonalRoute><EntryPage /></PersonalRoute>} />
      <Route path="/entries/:id" element={<PersonalRoute><TransactionDetail /></PersonalRoute>} />
      <Route path="/entries/:id/edit" element={<PersonalRoute><EntryPage /></PersonalRoute>} />
      <Route path="/personal/categories" element={<PersonalRoute><CategoriesScreen /></PersonalRoute>} />
      <Route path="/personal/assets" element={<PersonalRoute><AssetsScreen /></PersonalRoute>} />
      <Route path="/personal/tags" element={<PersonalRoute><TagsScreen /></PersonalRoute>} />
      <Route path="/people/:key" element={<PersonScreen />} />
      <Route path="/people/in/:tripId/:pid" element={<PersonScreen />} />
      <Route path="/r/:token" element={<RequestPage />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/me/bank" element={<BankDetails />} />
      <Route
        path="/t/:tripId"
        element={
          <GroupThemeScope>
            <GuestGate>
              <Outlet />
            </GuestGate>
          </GroupThemeScope>
        }
      >
        {tripPages}
      </Route>
      <Route path="/j/:token" element={<Join />}>
        {tripPages}
        <Route path="e/:expenseId" element={<OldExpenseLink />} />
      </Route>
    </Routes>
    </>
  );
}
