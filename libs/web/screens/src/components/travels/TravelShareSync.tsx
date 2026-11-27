import { useTravelShareSync } from '@cc/web-data-access/travels';

/** Mounts once on Sổ chi tiêu to sync matching group shares into active/lead-up trips. */
export function TravelShareSync(): null {
  useTravelShareSync();
  return null;
}
