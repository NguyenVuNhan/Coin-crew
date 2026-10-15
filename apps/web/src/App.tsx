import { Routes, Route } from 'react-router';
import { Placeholder } from './screens/Placeholder';
import { Landing } from './screens/Landing';
import { MyTrips } from './screens/MyTrips';
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

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/trips" element={<MyTrips />} />
      <Route path="/trips/new" element={<CreateTrip />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/me/bank" element={<BankDetails />} />
      <Route path="/j/:token" element={<Join />} />
      <Route path="/t/:tripId" element={<TripRoute />} />
      <Route path="/t/:tripId/who" element={<WhoAreYou />} />
      <Route path="/t/:tripId/expenses/new" element={<ExpenseForm />} />
      <Route path="/t/:tripId/expenses/:expenseId/edit" element={<ExpenseForm />} />
      <Route path="/t/:tripId/expenses/:expenseId" element={<TripRoute />} />
      <Route path="/t/:tripId/payments/:paymentId" element={<TripRoute />} />
      <Route path="/t/:tripId/approvals" element={<TripRoute />} />
      <Route path="/t/:tripId/pay/:toId" element={<PayScreen />} />
      <Route path="/t/:tripId/bank" element={<BankDetails />} />
      <Route path="/t/:tripId/people" element={<People />} />
      <Route path="/t/:tripId/activity" element={<Activity />} />
      <Route path="/t/:tripId/settings" element={<Settings />} />
    </Routes>
  );
}
