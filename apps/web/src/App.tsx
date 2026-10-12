import { Routes, Route } from 'react-router';
import { Placeholder } from './screens/Placeholder';
import { Landing } from './screens/Landing';
import { MyTrips } from './screens/MyTrips';
import { CreateTrip } from './screens/CreateTrip';
import { Privacy } from './screens/Privacy';
import { Join } from './screens/Join';
import { TripRoute } from './screens/TripRoute';
import { WhoAreYou } from './screens/WhoAreYou';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/trips" element={<MyTrips />} />
      <Route path="/trips/new" element={<CreateTrip />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/me/bank" element={<Placeholder />} />
      <Route path="/j/:token" element={<Join />} />
      <Route path="/t/:tripId" element={<TripRoute />} />
      <Route path="/t/:tripId/who" element={<WhoAreYou />} />
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
