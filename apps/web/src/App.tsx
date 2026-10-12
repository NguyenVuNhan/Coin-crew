import { Routes, Route } from 'react-router';
import { Placeholder } from './screens/Placeholder';
import { Landing } from './screens/Landing';
import { MyTrips } from './screens/MyTrips';
import { CreateTrip } from './screens/CreateTrip';
import { Privacy } from './screens/Privacy';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/trips" element={<MyTrips />} />
      <Route path="/trips/new" element={<CreateTrip />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/me/bank" element={<Placeholder />} />
      <Route path="/j/:token" element={<Placeholder />} />
      <Route path="/t/:tripId" element={<Placeholder />} />
      <Route path="/t/:tripId/who" element={<Placeholder />} />
      <Route path="/t/:tripId/expenses/new" element={<Placeholder />} />
      <Route path="/t/:tripId/expenses/:expenseId/edit" element={<Placeholder />} />
      <Route path="/t/:tripId/pay/:toId" element={<Placeholder />} />
      <Route path="/t/:tripId/bank" element={<Placeholder />} />
      <Route path="/t/:tripId/people" element={<Placeholder />} />
      <Route path="/t/:tripId/activity" element={<Placeholder />} />
      <Route path="/t/:tripId/settings" element={<Placeholder />} />
    </Routes>
  );
}
