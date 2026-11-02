import { Routes, Route, Navigate, useLocation } from 'react-router';
import { Placeholder } from './screens/Placeholder';
import { Landing } from './screens/Landing';
import { Home } from './screens/Home';
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
import { BankDetails } from './screens/BankDetails';
import { GuestBank } from './screens/GuestBank';
import { AuthNotice } from './components/AuthNotice';

function TripsRoute() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  if (params.has('mergeReview') || params.get('tab') === 'groups') {
    return <Navigate to={{ pathname: '/groups', search }} replace />;
  }
  return <Home />;
}

/** A trip's pages, mounted under `/t/:tripId` (members) and `/j/:token` (guests and view-only links). */
const tripPages = (
  <>
    <Route index element={<TripRoute />} />
    <Route path="who" element={<WhoAreYou />} />
    <Route path="expenses/new" element={<ExpenseForm />} />
    <Route path="expenses/:expenseId/edit" element={<ExpenseForm />} />
    <Route path="fund/:incomeId/edit" element={<ExpenseForm />} />
    <Route path="expenses/:expenseId" element={<TripRoute />} />
    <Route path="payments/:paymentId" element={<TripRoute />} />
    <Route path="fund/:incomeId" element={<TripRoute />} />
    <Route path="approvals" element={<TripRoute />} />
    <Route path="ratings" element={<TripRoute />} />
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
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/trips" element={<TripsRoute />} />
      <Route path="/groups" element={<Groups />} />
      <Route path="/activity" element={<MyActivity />} />
      <Route path="/trips/new" element={<CreateTrip />} />
      <Route path="/people/:key" element={<PersonScreen />} />
      <Route path="/r/:token" element={<RequestPage />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/me/bank" element={<BankDetails />} />
      <Route path="/t/:tripId">{tripPages}</Route>
      <Route path="/j/:token" element={<Join />}>
        {tripPages}
        <Route path="e/:expenseId" element={<OldExpenseLink />} />
      </Route>
    </Routes>
    </>
  );
}
