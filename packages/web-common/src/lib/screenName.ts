/** Fixed routes from App.tsx → names. Ids and tokens never appear in the result. */
const EXACT: Record<string, string> = {
  '/': 'landing',
  '/trips': 'trips',
  '/groups': 'groups',
  '/activity': 'my-activity',
  '/trips/new': 'create-trip',
  '/privacy': 'privacy',
  '/me/bank': 'my-bank',
};

/** The feedback `screen` field: a route name such as `trip-expenses`, never the URL. */
export function screenName(pathname: string): string {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const exact = EXACT[path];
  if (exact) return exact;

  const [, first, , sub] = path.split('/');
  if (first === 'people') return 'person';
  if (first === 'r') return 'request';
  if (first === 'j') return 'guest-trip';
  if (first === 't') {
    if (!sub) return 'trip';
    return /^[a-z]{1,30}$/.test(sub) ? `trip-${sub}` : 'trip-other';
  }
  return 'other';
}
