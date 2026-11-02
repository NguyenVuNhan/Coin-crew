import type { SplitMode } from '@fsl/core';
import { parseVnd, formatVnd } from '@fsl/core';

export function toEntryValue(mode: SplitMode, display: string): number | null {
  switch (mode) {
    case 'equal':
      return 1;

    case 'amounts': {
      const s = display.trim();
      if (s === '' || s === '0') return 0;
      return parseVnd(s);
    }

    case 'adjust': {
      const s = display.trim();
      let sign = 1;
      let rest = s;
      if (s.startsWith('+')) {
        sign = 1;
        rest = s.slice(1).trim();
      } else if (s.startsWith('-')) {
        sign = -1;
        rest = s.slice(1).trim();
      }
      if (rest === '' || rest === '0') return 0;
      const parsed = parseVnd(rest);
      if (parsed === null) return null;
      return sign * parsed;
    }

    case 'percent':
    case 'shares': {
      const s = display.trim();
      if (!/^\d+([.,]\d{1,2})?$/.test(s)) return null;
      const normalised = s.replace(',', '.');
      return Math.round(Number(normalised) * 100);
    }
  }
}

/**
 * What one split box means. A blank exact-amount or percent box is automatic (`value: null`: it shares what the typed
 * boxes leave); a blank shares box is one share and a blank adjustment none. `ok: false` is text that doesn't parse.
 */
export function readSplitInput(mode: SplitMode, text: string): { ok: true; value: number | null } | { ok: false } {
  if (text.trim() === '') {
    switch (mode) {
      case 'amounts':
      case 'percent':
        return { ok: true, value: null };
      case 'shares':
        return { ok: true, value: 100 };
      case 'adjust':
        return { ok: true, value: 0 };
      case 'equal':
        return { ok: true, value: 1 };
    }
  }
  const value = toEntryValue(mode, text);
  return value === null ? { ok: false } : { ok: true, value };
}

export function fromEntryValue(mode: SplitMode, value: number | null): string {
  if (value === null) return '';
  switch (mode) {
    case 'equal':
      return '';

    case 'percent':
    case 'shares': {
      const whole = Math.trunc(value / 100);
      const frac = Math.abs(value % 100);
      if (frac === 0) return `${whole}`;
      if (frac % 10 === 0) return `${whole}.${frac / 10}`;
      return `${whole}.${String(frac).padStart(2, '0')}`;
    }

    case 'amounts':
    case 'adjust': {
      return formatVnd(value).replace(/₫$/, '');
    }
  }
}
