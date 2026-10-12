import type { Lang } from '../i18n';
import { en } from '../i18n/en';
import { vi } from '../i18n/vi';

export function remindText(
  lang: Lang,
  vars: { name: string; creditor: string; amount: string; trip: string; link: string },
): string {
  const dict = lang === 'vi' ? vi : en;
  let msg = dict['remind.text'];
  for (const [key, value] of Object.entries(vars)) {
    msg = msg.replaceAll(`{${key}}`, value);
  }
  return msg;
}

export async function remind(text: string): Promise<'shared' | 'copied' | 'failed'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return 'shared';
      }
    }
  }

  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch {
      return 'failed';
    }
  }

  return 'failed';
}
