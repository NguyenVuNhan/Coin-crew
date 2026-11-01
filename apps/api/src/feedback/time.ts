/** `d` rounded down to the hour in UTC, as ISO: `2026-11-01T13:00:00.000Z`. */
export function hourBucket(d: Date): string {
  const h = new Date(d.getTime());
  h.setUTCMinutes(0, 0, 0);
  return h.toISOString();
}
