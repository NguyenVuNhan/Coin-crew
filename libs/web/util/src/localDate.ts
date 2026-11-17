/** Local calendar date as `YYYY-MM-DD` (never UTC). */
export function todayLocal(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Local calendar month as `YYYY-MM` (never UTC). */
export function currentMonthLocal(now: Date = new Date()): string {
  return todayLocal(now).slice(0, 7);
}
