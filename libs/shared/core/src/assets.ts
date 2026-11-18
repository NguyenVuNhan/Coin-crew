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

export interface ParsedAssetUnit {
  unit: string;
  decimals: number;
}

const NUMERIC_INPUT_RE = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;
const STEP_FRAC_RE = /^0[.,](0{0,7})1$/;

export function parseAssetUnit(text: string): ParsedAssetUnit | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (NUMERIC_INPUT_RE.test(trimmed)) {
    if (trimmed === '1') {
      return { unit: '', decimals: 0 };
    }
    const stepMatch = STEP_FRAC_RE.exec(trimmed);
    if (stepMatch) {
      return { unit: '', decimals: (stepMatch[1]?.length ?? 0) + 1 };
    }
    return null;
  }

  if (trimmed.length > 20) return null;
  return { unit: trimmed, decimals: 2 };
}

export function assetUnitText(asset: { unit: string; decimals: number }): string {
  if (asset.unit) return asset.unit;
  if (asset.decimals <= 0) return '1';
  const clamped = Math.min(asset.decimals, MAX_ASSET_DECIMALS);
  return `0.${'0'.repeat(clamped - 1)}1`;
}

export function assetQuantityLabel(
  quantity: number,
  asset: { name: string; unit: string; decimals: number },
): string {
  return `${formatQuantity(quantity, asset.decimals)} ${asset.unit || asset.name}`;
}

/** True when the asset's unit is a numeric lot step (e.g. 0.0001 BTC) rather than a word. */
export function isLotAsset(asset: { unit: string }): boolean {
  return asset.unit === '';
}

/** Number of decimal places accepted when typing a quantity for this asset. */
export function quantityInputDecimals(asset: { unit: string; decimals: number }): number {
  return isLotAsset(asset) ? 0 : asset.decimals;
}
