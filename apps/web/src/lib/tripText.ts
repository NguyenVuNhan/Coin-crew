import type { ExpenseView, TripView } from '@fsl/core';
import type { MessageKey } from '../i18n/en';

export function nameOf(view: TripView, id: string): string {
  const person = view.people.find((p) => p.id === id);
  return person?.name ?? '?';
}

export function splitText(
  e: ExpenseView,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
): string {
  switch (e.mode) {
    case 'equal':
      return t('split.equal', { n: e.shares.length });
    case 'amounts':
      return t('split.amounts');
    case 'percent':
      return t('split.percent');
    case 'shares':
      return t('split.shares');
    case 'adjust':
      return t('split.adjust');
    default:
      return '';
  }
}
