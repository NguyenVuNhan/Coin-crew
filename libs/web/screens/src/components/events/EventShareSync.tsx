import { useEventShareSync } from '@cc/web-data-access/events';

/** Mounts once on Sổ chi tiêu to sync matching group shares into active/lead-up trips. */
export function EventShareSync(): null {
  useEventShareSync();
  return null;
}
