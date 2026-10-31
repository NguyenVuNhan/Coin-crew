import { Routes, Route } from 'react-router';
import { Placeholder } from './screens/Placeholder';
import { Landing } from './screens/Landing';
import { Home } from './screens/Home';
import { PersonScreen } from './screens/PersonScreen';
import { CreateTrip } from './screens/CreateTrip';
import { Privacy } from './screens/Privacy';
import { Join } from './screens/Join';
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

export function App() {
  return (
    <>
      <AuthNotice />
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/trips" element={<Home />} />
      <Route path="/trips/new" element={<CreateTrip />} />
      <Route path="/people/:key" element={<PersonScreen />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/me/bank" element={<BankDetails />} />
      <Route path="/j/:token" element={<Join />} />
      <Route path="/j/:token/e/:expenseId" element={<Join />} />
      <Route path="/t/:tripId" element={<TripRoute />} />
      <Route path="/t/:tripId/who" element={<WhoAreYou />} />
      <Route path="/t/:tripId/expenses/new" element={<ExpenseForm />} />
      <Route path="/t/:tripId/expenses/:expenseId/edit" element={<ExpenseForm />} />
      <Route path="/t/:tripId/fund/:incomeId/edit" element={<ExpenseForm />} />
      <Route path="/t/:tripId/expenses/:expenseId" element={<TripRoute />} />
      <Route path="/t/:tripId/payments/:paymentId" element={<TripRoute />} />
      <Route path="/t/:tripId/fund/:incomeId" element={<TripRoute />} />
      <Route path="/t/:tripId/approvals" element={<TripRoute />} />
      <Route path="/t/:tripId/ratings" element={<TripRoute />} />
      <Route path="/t/:tripId/pay/:toId" element={<PayScreen />} />
      <Route path="/t/:tripId/bank" element={<BankDetails />} />
      <Route path="/t/:tripId/people" element={<People />} />
      <Route path="/t/:tripId/people/:pid/bank" element={<GuestBank />} />
      <Route path="/t/:tripId/activity" element={<Activity />} />
      <Route path="/t/:tripId/settings" element={<Settings />} />
    </Routes>
    </>
  );
}
