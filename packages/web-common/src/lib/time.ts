import { getLang, t } from '../i18n';

export function formatAgo(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 1) {
    return t('time.justNow');
  }
  if (diffHours < 1) {
    return t('time.minutesAgo', { n: diffMin });
  }
  if (diffDays < 1) {
    return t('time.hoursAgo', { n: diffHours });
  }
  return t('time.daysAgo', { n: diffDays });
}

const locale = () => (getLang() === 'vi' ? 'vi-VN' : 'en-GB');

/** "14 Oct 2026" for a YYYY-MM-DD date, read as that calendar day wherever the viewer is. */
export function formatDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(y, m - 1, d));
}

/** "12 Oct 2026, 15:04" in the viewer's time zone, for an ISO timestamp. */
export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

/** "03/11" (dd/MM) for an ISO timestamp, read in Vietnam time. */
export function formatExpiry(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' }).format(date);
}
