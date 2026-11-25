import {
  createGroupWalletResolver,
  type BookRow,
  type GroupRow,
  type WalletDetailView,
} from '@cc/core';
import type { useT } from '@cc/web-i18n';
import { todayLocal } from '@cc/web-util/localDate';

/** Formats `YYYY-MM-DD` as `DD/MM/YYYY`, or returns the input unchanged if not ISO. */
export function formatFullCalendarDate(dateStr: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return dateStr;
  const [, yearStr, monthStr, dayStr] = match;
  return `${dayStr}/${monthStr}/${yearStr}`;
}

/** Formats `YYYY-MM-DD` as `DD/MM` (or `DD/MM/YYYY` in another year). */
export function formatShortCalendarDate(
  dateStr: string,
  currentYear: number = Number(todayLocal().slice(0, 4)),
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return dateStr;
  const [, yearStr, monthStr, dayStr] = match;
  return Number(yearStr) === currentYear
    ? `${dayStr}/${monthStr}`
    : `${dayStr}/${monthStr}/${yearStr}`;
}

/** Formats `YYYY-MM-DD` concisely for row metadata ("Today" / "Yesterday" / "16/11"). */
export function formatCompactRowDate(
  dateStr: string,
  t: ReturnType<typeof useT>,
  now?: Date,
): string {
  const current = now ?? new Date();
  const today = todayLocal(current);
  const yesterday = todayLocal(
    new Date(current.getFullYear(), current.getMonth(), current.getDate() - 1),
  );
  if (dateStr === today) return t('entryDate.today');
  if (dateStr === yesterday) return t('entryDate.yesterday');
  return formatShortCalendarDate(dateStr, current.getFullYear());
}

/** Shows wallet name on rows only when the user tracks multiple active wallets (or an archived one). */
export function shouldShowWalletName(
  wallets: WalletDetailView[],
  resolvedWallet?: WalletDetailView,
  hideWalletName?: boolean,
): boolean {
  if (hideWalletName) return false;
  const activeCount = wallets.filter((w) => !w.archived).length;
  return activeCount > 1 || Boolean(resolvedWallet?.archived);
}

function rowDate(row: BookRow): string {
  return row.kind === 'entry' ? row.entry.date : row.date;
}

function resolveRowWallet(
  row: BookRow,
  walletsById: Map<string, WalletDetailView>,
  resolveGroupWalletId: (r: GroupRow) => string | null,
): WalletDetailView | undefined {
  if (row.kind === 'entry') return walletsById.get(row.entry.walletId);
  if (row.kind === 'person') return walletsById.get(row.walletId);
  const wid = resolveGroupWalletId(row);
  return wid ? walletsById.get(wid) : undefined;
}

/** True when a row falls before its resolved wallet's start date. */
export function isRowBeforeStart(
  row: BookRow,
  wallets: WalletDetailView[],
  resolveGroupWalletId?: (r: GroupRow) => string | null,
): boolean {
  if (row.kind === 'entry') return Boolean(row.entry.beforeStart);
  const walletsById = new Map(wallets.map((w) => [w.id, w]));
  const resolver =
    resolveGroupWalletId ??
    createGroupWalletResolver(
      wallets,
      wallets.find((w) => w.isDefault)?.id ?? null,
    );
  const wallet = resolveRowWallet(row, walletsById, resolver);
  return wallet !== undefined && row.date < wallet.startDate;
}

/**
 * Returns the single wallet defining a clean chronological pre-start boundary for a day-grouped list,
 * or `null` when multiple start dates / wallets interleave and rows should show an inline cue instead.
 */
export function resolveSingleBoundaryWallet(
  wallets: WalletDetailView[],
  rows: BookRow[],
): WalletDetailView | null {
  if (wallets.length === 0 || rows.length === 0) return null;
  const walletsById = new Map(wallets.map((w) => [w.id, w]));
  const defaultWalletId = wallets.find((w) => w.isDefault)?.id ?? null;
  const resolveGroupWalletId = createGroupWalletResolver(wallets, defaultWalletId);

  let boundaryWallet: WalletDetailView | null = null;
  for (const row of rows) {
    if (!isRowBeforeStart(row, wallets, resolveGroupWalletId)) continue;
    const w = resolveRowWallet(row, walletsById, resolveGroupWalletId);
    if (!w) return null;
    if (rowDate(row) >= w.startDate) return null;
    if (boundaryWallet && boundaryWallet.id !== w.id) return null;
    boundaryWallet = w;
  }

  if (!boundaryWallet) return null;

  for (const row of rows) {
    if (rowDate(row) < boundaryWallet.startDate) {
      if (!isRowBeforeStart(row, wallets, resolveGroupWalletId)) {
        return null;
      }
    }
  }

  return boundaryWallet;
}
