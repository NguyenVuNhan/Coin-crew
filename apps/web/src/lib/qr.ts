import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { formatVnd } from '@fsl/core';

const PNG_SIZE = 1024;

/**
 * The VietQR picture for a payload as SVG text; '' while it is being made, and when there is no payload. A picture is
 * kept with the payload it was made from, so a new payload never shows the previous picture.
 */
export function useQrSvg(payload: string | null): string {
  const [made, setMade] = useState<{ payload: string; svg: string } | null>(null);

  useEffect(() => {
    if (!payload) {
      setMade(null);
      return;
    }
    let active = true;
    QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 })
      .then((svg) => {
        if (active) setMade({ payload, svg });
      })
      .catch(() => {
        if (active) setMade(null);
      });
    return () => {
      active = false;
    };
  }, [payload]);

  return payload !== null && made?.payload === payload ? made.svg : '';
}

/** The SVG text as an `<img src>`; '' for no picture yet. */
export function qrSrc(svg: string): string {
  return svg ? 'data:image/svg+xml;utf8,' + encodeURIComponent(svg) : '';
}

/** The QR as a 1024px white-backed PNG, or null where the browser cannot draw it. */
export function qrPngBlob(svg: string): Promise<Blob | null> {
  if (!svg || typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = PNG_SIZE;
      canvas.height = PNG_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, PNG_SIZE, PNG_SIZE);

      const img = new Image();
      img.onload = () => {
        try {
          ctx.drawImage(img, 0, 0, PNG_SIZE, PNG_SIZE);
          canvas.toBlob((blob) => resolve(blob), 'image/png');
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = qrSrc(svg);
    } catch {
      resolve(null);
    }
  });
}

function fileName(refCode: string): string {
  return `vietqr-${(refCode || 'qr').replace(/\s+/g, '-')}.png`;
}

function download(blob: Blob, refCode: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.download = fileName(refCode);
  a.href = url;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Downloads the QR as a PNG named after the transfer note. Does nothing where the picture cannot be made. */
export async function saveQr(svg: string, refCode: string): Promise<void> {
  const blob = await qrPngBlob(svg);
  if (blob) download(blob, refCode);
}

/**
 * Shares the QR picture with a message through the share sheet. Without file sharing it saves the picture and copies
 * the message instead ('saved'); 'failed' when neither worked. Closing the share sheet counts as 'shared'.
 */
export async function shareQr(svg: string, text: string, refCode: string): Promise<'shared' | 'saved' | 'failed'> {
  const blob = await qrPngBlob(svg);

  if (blob && typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof File !== 'undefined') {
    const files = [new File([blob], fileName(refCode), { type: 'image/png' })];
    if (navigator.canShare?.({ files })) {
      try {
        await navigator.share({ files, text });
        return 'shared';
      } catch (err) {
        // A DOMException from another frame or realm is not `instanceof Error`, so go by its name.
        if ((err as { name?: unknown } | null)?.name === 'AbortError') return 'shared';
      }
    }
  }

  let saved = false;
  if (blob) {
    try {
      download(blob, refCode);
      saved = true;
    } catch {
      // fall through to the message
    }
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      saved = true;
    } catch {
      // the clipboard is blocked
    }
  }
  return saved ? 'saved' : 'failed';
}

export interface SportBillCardInput {
  description: string;
  spentOn: string;
  groupName: string;
  total: number;
  court: number;
  shuttlecocksTotal: number;
  extra: number;
  maleSlotRate: number;
  femaleSlotRate: number;
  totalMaleSlots: number;
  totalFemaleSlots: number;
  rows: { name: string; femaleSlots: number; maleSlots: number; isFixed: boolean; amount: number }[];
  payerName: string;
  bank?: { bankName: string; accountNumber: string; holderName: string } | null;
  qrSvg?: string;
}

export function renderSportBillPng(input: SportBillCardInput): Promise<Blob | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  const canvas = document.createElement('canvas');
  const rowHeight = 56;
  const headerHeight = 140;
  const tableRows = 1 + input.rows.length + 3; // header + rows + 3 summary rows
  const tableHeight = tableRows * rowHeight;
  const hasQr = Boolean(input.qrSvg && input.bank);
  const qrSectionHeight = hasQr ? 380 : 0;
  const totalHeight = headerHeight + tableHeight + qrSectionHeight + 48;

  canvas.width = 1080;
  canvas.height = totalHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Header
  const padX = 48;
  const tableWidth = canvas.width - padX * 2;

  ctx.fillStyle = '#111827';
  ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(input.description, padX, 48);

  ctx.fillStyle = '#6b7280';
  ctx.font = '22px system-ui, -apple-system, sans-serif';
  ctx.fillText(`${input.spentOn} · ${input.groupName}`, padX, 96);

  // Table Columns
  // Col 0: TÊN (width 424)
  // Col 1: NỮ (width 160)
  // Col 2: NAM (width 160)
  // Col 3: THÀNH TIỀN (width 240)
  const colWidths = [424, 160, 160, 240] as const;
  const colX = [
    padX,
    padX + colWidths[0],
    padX + colWidths[0] + colWidths[1],
    padX + colWidths[0] + colWidths[1] + colWidths[2],
  ] as const;

  let currentY = headerHeight;

  function drawCell(
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    align: 'left' | 'center' | 'right',
    isBold: boolean,
    color = '#111827',
  ) {
    if (!ctx) return;
    ctx.fillStyle = color;
    ctx.font = `${isBold ? 'bold ' : ''}20px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    const textX = align === 'left' ? x + 16 : align === 'center' ? x + w / 2 : x + w - 16;
    ctx.fillText(text, textX, y + h / 2);
  }

  function drawRowBorder(y: number) {
    if (!ctx) return;
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, y);
    ctx.lineTo(padX + tableWidth, y);
    ctx.stroke();
  }

  // 1. Table Header
  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(padX, currentY, tableWidth, rowHeight);
  drawRowBorder(currentY);
  drawCell('TÊN', colX[0], currentY, colWidths[0], rowHeight, 'left', true);
  drawCell('NỮ', colX[1], currentY, colWidths[1], rowHeight, 'center', true);
  drawCell('NAM', colX[2], currentY, colWidths[2], rowHeight, 'center', true);
  drawCell('THÀNH TIỀN', colX[3], currentY, colWidths[3], rowHeight, 'right', true);
  currentY += rowHeight;
  drawRowBorder(currentY);

  // 2. Participant Rows
  for (const row of input.rows) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(padX, currentY, tableWidth, rowHeight);
    drawCell(row.name + (row.isFixed ? ' (Cố định)' : ''), colX[0], currentY, colWidths[0], rowHeight, 'left', false);
    drawCell(row.femaleSlots ? String(row.femaleSlots) : '—', colX[1], currentY, colWidths[1], rowHeight, 'center', false);
    drawCell(row.maleSlots ? String(row.maleSlots) : '—', colX[2], currentY, colWidths[2], rowHeight, 'center', false);
    drawCell(formatVnd(row.amount), colX[3], currentY, colWidths[3], rowHeight, 'right', false);
    currentY += rowHeight;
    drawRowBorder(currentY);
  }

  // 3. Yellow TỔNG SUẤT row
  ctx.fillStyle = '#fef9c3';
  ctx.fillRect(padX, currentY, tableWidth, rowHeight);
  drawCell('TỔNG SUẤT', colX[0], currentY, colWidths[0], rowHeight, 'left', true);
  drawCell(String(input.totalFemaleSlots), colX[1], currentY, colWidths[1], rowHeight, 'center', true);
  drawCell(String(input.totalMaleSlots), colX[2], currentY, colWidths[2], rowHeight, 'center', true);
  drawCell(`${input.totalFemaleSlots + input.totalMaleSlots} suất`, colX[3], currentY, colWidths[3], rowHeight, 'right', true);
  currentY += rowHeight;
  drawRowBorder(currentY);

  // 4. Gray CHI PHÍ row
  ctx.fillStyle = '#e5e7eb';
  ctx.fillRect(padX, currentY, tableWidth, rowHeight);
  drawCell('CHI PHÍ', colX[0], currentY, colWidths[0], rowHeight, 'left', true);
  const costSummary = [
    input.court > 0 ? `Sân: ${formatVnd(input.court)}` : null,
    input.shuttlecocksTotal > 0 ? `Cầu: ${formatVnd(input.shuttlecocksTotal)}` : null,
    input.extra > 0 ? `Phụ: ${formatVnd(input.extra)}` : null,
  ].filter(Boolean).join(' · ');
  drawCell(costSummary, colX[1], currentY, colWidths[1] + colWidths[2], rowHeight, 'center', false, '#4b5563');
  drawCell(formatVnd(input.total), colX[3], currentY, colWidths[3], rowHeight, 'right', true);
  currentY += rowHeight;
  drawRowBorder(currentY);

  // 5. Yellow MỖI SUẤT row
  ctx.fillStyle = '#fef9c3';
  ctx.fillRect(padX, currentY, tableWidth, rowHeight);
  drawCell('MỖI SUẤT', colX[0], currentY, colWidths[0], rowHeight, 'left', true);
  drawCell(formatVnd(input.femaleSlotRate), colX[1], currentY, colWidths[1], rowHeight, 'center', true);
  drawCell(formatVnd(input.maleSlotRate), colX[2], currentY, colWidths[2], rowHeight, 'center', true);
  drawCell('', colX[3], currentY, colWidths[3], rowHeight, 'right', true);
  currentY += rowHeight;
  drawRowBorder(currentY);

  if (hasQr && input.qrSvg && input.bank) {
    const qrSize = 240;
    const qrX = (canvas.width - qrSize) / 2;
    const qrY = currentY + 36;
    const bankY = qrY + qrSize + 28;

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          ctx.drawImage(img, qrX, qrY, qrSize, qrSize);
          ctx.fillStyle = '#1f2937';
          ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          const bankText = `${input.payerName} · ${input.bank!.bankName} · ${input.bank!.accountNumber} · ${input.bank!.holderName}`;
          ctx.fillText(bankText, canvas.width / 2, bankY);
          canvas.toBlob((blob) => resolve(blob), 'image/png');
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = qrSrc(input.qrSvg!);
    });
  }

  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } catch {
      resolve(null);
    }
  });
}

export async function shareSportBill(
  input: SportBillCardInput,
  text: string,
  refCode: string,
): Promise<'shared' | 'saved' | 'failed'> {
  const blob = await renderSportBillPng(input);
  const billFileName = `bill-${(refCode || 'sport').replace(/\s+/g, '-')}.png`;

  if (blob && typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof File !== 'undefined') {
    const files = [new File([blob], billFileName, { type: 'image/png' })];
    if (navigator.canShare?.({ files })) {
      try {
        await navigator.share({ files, text });
        return 'shared';
      } catch (err) {
        if ((err as { name?: unknown } | null)?.name === 'AbortError') return 'shared';
      }
    }
  }

  let saved = false;
  if (blob) {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.download = billFileName;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      saved = true;
    } catch {
      // fall through to clipboard
    }
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      saved = true;
    } catch {
      // clipboard blocked
    }
  }
  return saved ? 'saved' : 'failed';
}

/** The blob as a `data:` URL (some webviews cannot long-press-save `blob:` URLs). */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}
