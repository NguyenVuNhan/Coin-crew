import { formatVnd } from '@cc/core';
import { qrSrc } from './qr';

export interface LedgerCardRow {
  name: string;
  amount: number;
  /** Greyed out: someone who owes nothing on this card (the payer of a bill). */
  muted?: boolean;
  /** Drawn after the name, e.g. "(người trả)". */
  tag?: string;
}

/**
 * A two-column money card (name | amount) with an optional QR and bank line under it: the group "request payment"
 * picture and the single-expense bill picture. Every label comes in from the caller (this library has no copy).
 */
export interface LedgerCardInput {
  title: string;
  meta: string;
  nameHeader: string;
  amountHeader: string;
  rows: LedgerCardRow[];
  totalLabel: string;
  total: number;
  /** Omitted: no QR, bank line or hint. */
  qrSvg?: string;
  bankLine?: string;
  hint?: string;
}

const WIDTH = 1080;
const PAD_X = 48;
const ROW_H = 56;
const HEADER_H = 140;
const AMOUNT_COL = 260;
const QR_SIZE = 240;
const QR_SECTION = 400;
const DEBT = '#be123c';
const INK = '#111827';
const MUTED = '#9ca3af';
const FONT = 'system-ui, -apple-system, sans-serif';

/** `text` cut with "…" so `measure(text)` fits in `max` pixels. */
function fit(text: string, max: number, measure: (s: string) => number): string {
  if (measure(text) <= max) return text;
  const chars = Array.from(text);
  while (chars.length > 0 && measure(chars.join('') + '…') > max) chars.pop();
  return chars.join('') + '…';
}

export function renderLedgerPng(input: LedgerCardInput): Promise<Blob | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  const canvas = document.createElement('canvas');
  const hasQr = Boolean(input.qrSvg);
  const tableH = (input.rows.length + 2) * ROW_H;
  canvas.width = WIDTH;
  canvas.height = HEADER_H + tableH + (hasQr ? QR_SECTION : 0) + 48;

  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  const tableW = WIDTH - PAD_X * 2;
  const nameW = tableW - AMOUNT_COL;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = INK;
  ctx.font = `bold 36px ${FONT}`;
  ctx.fillText(fit(input.title, tableW, (s) => ctx.measureText(s).width), PAD_X, 48);
  ctx.fillStyle = '#6b7280';
  ctx.font = `22px ${FONT}`;
  ctx.fillText(fit(input.meta, tableW, (s) => ctx.measureText(s).width), PAD_X, 96);

  const border = (y: number) => {
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD_X, y);
    ctx.lineTo(PAD_X + tableW, y);
    ctx.stroke();
  };
  const row = (y: number, name: string, amount: string, opts: { bold: boolean; nameColor: string; amountColor: string; fill?: string }) => {
    if (opts.fill) {
      ctx.fillStyle = opts.fill;
      ctx.fillRect(PAD_X, y, tableW, ROW_H);
    }
    ctx.font = `${opts.bold ? 'bold ' : ''}20px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = opts.nameColor;
    ctx.fillText(fit(name, nameW - 32, (s) => ctx.measureText(s).width), PAD_X + 16, y + ROW_H / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = opts.amountColor;
    ctx.fillText(amount, PAD_X + tableW - 16, y + ROW_H / 2);
    border(y + ROW_H);
  };

  let y = HEADER_H;
  border(y);
  row(y, input.nameHeader, input.amountHeader, { bold: true, nameColor: '#374151', amountColor: '#374151', fill: '#f3f4f6' });
  y += ROW_H;
  for (const r of input.rows) {
    const color = r.muted ? MUTED : INK;
    row(y, r.tag ? `${r.name} ${r.tag}` : r.name, formatVnd(r.amount), {
      bold: false,
      nameColor: color,
      amountColor: r.muted ? MUTED : DEBT,
    });
    y += ROW_H;
  }
  row(y, input.totalLabel, formatVnd(input.total), { bold: true, nameColor: INK, amountColor: INK, fill: '#e5e7eb' });
  y += ROW_H;

  const toBlob = () =>
    new Promise<Blob | null>((resolve) => {
      try {
        canvas.toBlob((blob) => resolve(blob), 'image/png');
      } catch {
        resolve(null);
      }
    });

  if (!hasQr) return toBlob();

  const qrX = (WIDTH - QR_SIZE) / 2;
  const qrY = y + 36;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        ctx.drawImage(img, qrX, qrY, QR_SIZE, QR_SIZE);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        let lineY = qrY + QR_SIZE + 28;
        if (input.bankLine) {
          ctx.fillStyle = '#1f2937';
          ctx.font = `bold 22px ${FONT}`;
          ctx.fillText(fit(input.bankLine, tableW, (s) => ctx.measureText(s).width), WIDTH / 2, lineY);
          lineY += 36;
        }
        if (input.hint) {
          ctx.fillStyle = '#6b7280';
          ctx.font = `20px ${FONT}`;
          ctx.fillText(fit(input.hint, tableW, (s) => ctx.measureText(s).width), WIDTH / 2, lineY);
        }
        void toBlob().then(resolve);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = qrSrc(input.qrSvg!);
  });
}
