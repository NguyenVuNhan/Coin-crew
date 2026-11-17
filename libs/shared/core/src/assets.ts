export const ASSET_GROUPS: readonly string[] = ['Crypto', 'Cổ phiếu', 'ETF', 'Vàng'];

export const MAX_ASSET_DECIMALS = 8;
export const MAX_QUANTITY = 10 ** 15;

export function isValidQuantity(q: number): boolean {
  return typeof q === 'number' && Number.isSafeInteger(q) && q > 0 && q <= MAX_QUANTITY;
}

export function parseQuantity(text: string, decimals: number): number | null {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_ASSET_DECIMALS) {
    return null;
  }

  const s = text.trim();
  if (!s) return null;

  const match =
    /^(\d+)(?:,(\d+))?$/.exec(s) ??
    /^(\d{1,3}(?:\.\d{3})+)(?:,(\d+))?$/.exec(s);
  if (!match) return null;

  const whole = (match[1] ?? '').replace(/\./g, '');
  const frac = match[2] ?? '';
  if (frac.length > decimals) return null;

  const value = Number(whole + frac.padEnd(decimals, '0'));
  if (!isValidQuantity(value)) return null;
  return value;
}

export function formatQuantity(q: number, decimals: number): string {
  const sign = q < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(q));

  if (decimals <= 0) {
    const whole = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${sign}${whole}`;
  }

  const scale = 10 ** decimals;
  const wholeNum = Math.floor(abs / scale);
  const fracNum = abs % scale;
  const whole = String(wholeNum).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (fracNum === 0) return `${sign}${whole}`;
  const frac = String(fracNum).padStart(decimals, '0').replace(/0+$/, '');
  return `${sign}${whole},${frac}`;
}
