import { t } from '../i18n';

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
