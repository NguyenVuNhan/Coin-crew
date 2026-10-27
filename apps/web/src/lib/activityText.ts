import { formatVnd, type ActivityItem, type TripView } from '@fsl/core';
import type { MessageKey } from '../i18n/en';
import { t as translate } from '../i18n';
import { formatDay } from './time';
import { nameOf } from './tripText';

type T = typeof translate;

const NAME_LINE = {
  name_added: 'activity.nameAdded',
  name_approved: 'activity.nameApproved',
  person_removed: 'activity.personRemoved',
  person_restored: 'activity.personRestored',
} as const satisfies Record<string, MessageKey>;

const INCOME_LINE = {
  income_disabled: 'activity.incomeDisabled',
  income_enabled: 'activity.incomeEnabled',
  income_rolled_back: 'activity.incomeRolledBack',
} as const satisfies Record<string, MessageKey>;

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const money = (v: unknown): string | null => (typeof v === 'number' && Number.isFinite(v) ? formatVnd(v) : null);

/**
 * What an activity item says, using its `details` when they hold what the sentence needs
 * ("Chi added Bánh tráng nướng · 180.000₫"), and the generic wording ("Chi added an expense") when they do not.
 */
export function activityLine(item: ActivityItem, view: TripView | undefined, t: T): string {
  const actor = item.actorName ?? t('activity.someone');
  const d = item.details;

  const specific = (): string | null => {
    switch (item.action) {
      case 'expense_added':
      case 'expense_edited': {
        const description = text(d.description);
        const amount = money(d.amount);
        if (!description || !amount) return null;
        if (item.action === 'expense_added' && d.paidFromFund === true) return t('activity.fundExpenseAdded', { actor, description, amount });
        return t(item.action === 'expense_added' ? 'activity.expenseAdded' : 'activity.expenseEdited', { actor, description, amount });
      }
      case 'expense_approved':
      case 'expense_rejected': {
        const description = text(d.description);
        if (!description) return null;
        return t(item.action === 'expense_approved' ? 'activity.expenseApproved' : 'activity.expenseRejected', { actor, description });
      }
      case 'payment_recorded': {
        const fromId = text(d.fromId);
        const toId = text(d.toId);
        const amount = money(d.amount);
        if (!view || !fromId || !toId || !amount) return null;
        const known = (id: string) => view.people.some((p) => p.id === id);
        if (!known(fromId) || !known(toId)) return null;
        return t('activity.paymentRecorded', { from: nameOf(view, fromId), to: nameOf(view, toId), amount });
      }
      case 'payment_confirmed': {
        const amount = money(d.amount);
        return amount ? t('activity.paymentConfirmed', { actor, amount }) : null;
      }
      case 'payment_arrived': {
        const amount = money(d.amount);
        return amount ? t('activity.paymentArrived', { actor, amount }) : null;
      }
      case 'name_added':
      case 'name_approved':
      case 'person_removed':
      case 'person_restored': {
        const name = text(d.name);
        if (!name) return null;
        return t(NAME_LINE[item.action], { actor, name });
      }
      case 'bank_set':
      case 'bank_removed': {
        const participantId = text(d.participantId);
        if (!view || !participantId || !view.people.some((p) => p.id === participantId)) return null;
        return t(item.action === 'bank_set' ? 'activity.bankSet' : 'activity.bankRemoved', { actor, name: nameOf(view, participantId) });
      }
      case 'name_merged': {
        const from = text(d.fromName);
        const into = text(d.intoName);
        return from && into ? t('activity.nameMerged', { actor, from, into }) : null;
      }
      case 'admin_promoted': {
        const name = text(d.name);
        if (!name) return null;
        return t('activity.adminPromoted', { actor, name });
      }
      case 'admin_demoted': {
        const name = text(d.name);
        if (!name) return null;
        return t('activity.adminDemoted', { actor, name });
      }
      case 'expense_rolled_back': {
        const description = text(d.description);
        if (!description) return null;
        return t('activity.expenseRolledBack', { actor, description });
      }
      case 'income_added':
      case 'income_edited': {
        const description = text(d.description);
        const amount = money(d.amount);
        if (!description || !amount) return null;
        return t(item.action === 'income_added' ? 'activity.incomeAdded' : 'activity.incomeEdited', { actor, description, amount });
      }
      case 'income_disabled':
      case 'income_enabled':
      case 'income_rolled_back': {
        const description = text(d.description);
        if (!description) return null;
        return t(INCOME_LINE[item.action], { actor, description });
      }
      case 'ratings_changed': {
        if (typeof d.ratingsEnabled !== 'boolean') return null;
        return t(d.ratingsEnabled ? 'activity.ratingsEnabled' : 'activity.ratingsDisabled', { actor });
      }
      default:
        return null;
    }
  };

  return specific() ?? t('activity.line', { actor, action: t(`activity.action.${item.action}` as MessageKey) });
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymdOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** "21:40" in the viewer's time zone, for an ISO timestamp. */
export function timeOf(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Items under "Today", "Yesterday" or their date (in the current language), one group per calendar day in the
 * viewer's time zone. Groups and the items in them keep the order they come in (newest first from the server).
 */
export function groupByDay(items: ActivityItem[], now: Date): { label: string; items: ActivityItem[] }[] {
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const todayKey = ymdOf(now);
  const yesterdayKey = ymdOf(yesterday);

  const days = new Map<string, ActivityItem[]>();
  for (const item of items) {
    const key = ymdOf(new Date(item.createdAt));
    const group = days.get(key);
    if (group) group.push(item);
    else days.set(key, [item]);
  }

  return [...days].map(([key, dayItems]) => ({
    label: key === todayKey ? translate('activity.today') : key === yesterdayKey ? translate('activity.yesterday') : formatDay(key),
    items: dayItems,
  }));
}
