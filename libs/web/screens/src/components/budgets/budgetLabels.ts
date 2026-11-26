import type { BudgetDef, BudgetPeriod } from '@cc/core';
import type { useT } from '@cc/web-i18n';

export type BudgetPeriodLabelStyle = 'full' | 'short' | 'row';

export function parseYmd(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.split('-').map(Number);
  return [y ?? 1970, m ?? 1, d ?? 1];
}

export function diffDaysUtc(from: string, to: string): number {
  const [y1, m1, d1] = parseYmd(from);
  const [y2, m2, d2] = parseYmd(to);
  return Math.round(
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000,
  );
}

export function formatDayMonth(ymd: string): string {
  const [, m, d] = parseYmd(ymd);
  return `${d}/${m}`;
}

function formatFullDate(ymd: string): string {
  const [y, m, d] = parseYmd(ymd);
  return `${d}/${m}/${y}`;
}

/**
 * Formats a budget period label in one of three styles:
 * - `'full'`: summary card header (`Tháng 11/2026 · 1/11 – 30/11`)
 * - `'short'`: compact chart x-axis tick (`T11`, `2026`, `23/11`)
 * - `'row'`: past-period list row title (`Tháng 10`, `Năm 2025`, `16/11 – 22/11`)
 */
export function formatBudgetPeriodLabel(
  def: BudgetDef,
  period: BudgetPeriod,
  lang: 'vi' | 'en',
  style: BudgetPeriodLabelStyle = 'full',
): string {
  const [fy, fm, fd] = parseYmd(period.from);
  const [ty] = parseYmd(period.to);

  if (def.periodKind === 'month' && fd === 1 && (style !== 'full' || fy === ty)) {
    if (style === 'short') {
      return lang === 'vi' ? `T${fm}` : `M${fm}`;
    }
    const enMonthYear = new Date(Date.UTC(fy, fm - 1, 1)).toLocaleDateString(
      'en-US',
      { month: 'short', year: 'numeric', timeZone: 'UTC' },
    );
    if (style === 'row') {
      return lang === 'vi' ? `Tháng ${fm}` : enMonthYear;
    }
    const monthPart = lang === 'vi' ? `Tháng ${fm}/${fy}` : enMonthYear;
    return `${monthPart} · ${formatDayMonth(period.from)} – ${formatDayMonth(period.to)}`;
  }

  if (def.periodKind === 'year') {
    if (style === 'short') return String(fy);
    const yearPart = lang === 'vi' ? `Năm ${fy}` : String(fy);
    if (style === 'row') return yearPart;
    return `${yearPart} · ${formatDayMonth(period.from)} – ${formatDayMonth(period.to)}`;
  }

  if (style === 'short') {
    return formatDayMonth(period.from);
  }
  if (style === 'row') {
    return `${formatDayMonth(period.from)} – ${formatDayMonth(period.to)}`;
  }
  if (fy === ty) {
    return `${formatDayMonth(period.from)} – ${formatDayMonth(period.to)}/${ty}`;
  }
  return `${formatFullDate(period.from)} – ${formatFullDate(period.to)}`;
}

/** Formats remaining period time concisely for the summary card's third stat. */
export function formatTimeLeftShort(
  daysLeft: number,
  t: ReturnType<typeof useT>,
): string {
  if (daysLeft <= 0) return t('budgets.periodEnded');
  if (daysLeft >= 365) {
    const totalMonths = Math.floor(daysLeft / 30);
    const y = Math.floor(totalMonths / 12);
    const m = totalMonths % 12;
    return t('budgets.timeLeftMonthsShort', { y, m });
  }
  return t('budgets.timeLeftDaysShort', { n: daysLeft });
}
