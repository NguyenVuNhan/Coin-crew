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

export function fromEntryValue(mode: SplitMode, value: number): string {
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
