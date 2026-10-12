export const MAX_AMOUNT = 10_000_000_000;

export function formatVnd(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const digits = String(Math.abs(Math.trunc(amount)));
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}₫`;
}

const SUFFIX_ZEROS = { k: 3, tr: 6 } as const;

export function parseVnd(input: string): number | null {
  const s = input.trim().toLowerCase();
  let value: number | null = null;

  const suffixed = /^(\d+)(?:[.,](\d+))?\s*(k|tr)$/.exec(s);
  if (suffixed) {
    const [, whole = '', frac = '', unit] = suffixed;
    const zeros = SUFFIX_ZEROS[unit as keyof typeof SUFFIX_ZEROS];
    if (frac.length > zeros) return null;
    value = Number(whole) * 10 ** zeros + Number(frac.padEnd(zeros, '0') || '0');
  } else if (/^\d+$/.test(s) || /^\d{1,3}([., ])\d{3}(?:\1\d{3})*$/.test(s)) {
    value = Number(s.replace(/[., ]/g, ''));
  }

  if (value === null || !Number.isSafeInteger(value) || value <= 0 || value > MAX_AMOUNT) return null;
  return value;
}
