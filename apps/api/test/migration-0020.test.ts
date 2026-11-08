import { describe, it, expect } from 'vitest';
import { tripLocations } from '@cc/api-db/schema';

describe('0020_sport_planning_locations schema', () => {
  it('defines tripLocations table columns', () => {
    expect(tripLocations).toBeDefined();
    expect(tripLocations.id).toBeDefined();
    expect(tripLocations.tripId).toBeDefined();
    expect(tripLocations.name).toBeDefined();
    expect(tripLocations.address).toBeDefined();
    expect(tripLocations.phone).toBeDefined();
    expect(tripLocations.mapUrl).toBeDefined();
    expect(tripLocations.notes).toBeDefined();
  });
});
