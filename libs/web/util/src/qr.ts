import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  formatVnd,
  roundToThousand,
  type SportCourtSlot,
  type SportLocationSnapshot,
} from '@cc/core';

const PNG_SIZE = 1024;

/** The site mark from public/icon.svg (512 units square), drawn in the middle of every payment QR. */
const LOGO_MARK =
  '<rect width="512" height="512" rx="112.64" fill="#0f766e"/>' +
  '<text x="256" y="270" text-anchor="middle" dominant-baseline="central" fill="#ffffff" ' +
  'font-family="-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif" font-weight="bold" font-size="300">₫</text>';
/** The white plate's share of the code's width: about 6% of the modules, well within what level 'H' recovers. */
const PLATE_SHARE = 0.24;

/**
 * The QR SVG from `qrcode` with the site mark on a white plate in its middle. Only for codes made with error
 * correction 'H'. Returns the SVG unchanged when it has no square viewBox.
 */
export function withLogo(svg: string): string {
  const size = Number(/viewBox="0 0 (\d+(?:\.\d+)?) \1"/.exec(svg)?.[1]);
  const end = svg.lastIndexOf('</svg>');
  if (!size || end < 0) return svg;
  const plate = size * PLATE_SHARE;
  const at = (size - plate) / 2;
  const pad = plate * 0.1;
  const n = (v: number) => Number(v.toFixed(3));
  const logo =
    '<g data-logo="coincrew" shape-rendering="geometricPrecision">' +
    `<rect data-logo-plate="" x="${n(at)}" y="${n(at)}" width="${n(plate)}" height="${n(plate)}" rx="${n(plate * 0.22)}" fill="#ffffff"/>` +
    `<svg x="${n(at + pad)}" y="${n(at + pad)}" width="${n(plate - 2 * pad)}" height="${n(plate - 2 * pad)}" viewBox="0 0 512 512">${LOGO_MARK}</svg>` +
    '</g>';
  return svg.slice(0, end) + logo + svg.slice(end);
}

/**
 * The VietQR picture for a payload as SVG text, with the site mark in the middle; '' while it is being made, and when
 * there is no payload. A picture is kept with the payload it was made from, so a new payload never shows the previous
 * picture.
 */
export function useQrSvg(payload: string | null): string {
  const [made, setMade] = useState<{ payload: string; svg: string } | null>(null);

  useEffect(() => {
    if (!payload) {
      setMade(null);
      return;
    }
    let active = true;
    QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'H', margin: 2 })
      .then((svg) => {
        if (active) setMade({ payload, svg: withLogo(svg) });
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
  roundTransfers?: boolean;
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

  const round = input.roundTransfers ? roundToThousand : (v: number) => v;

  // 2. Participant Rows
  for (const row of input.rows) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(padX, currentY, tableWidth, rowHeight);
    drawCell(row.name + (row.isFixed ? ' (Cố định)' : ''), colX[0], currentY, colWidths[0], rowHeight, 'left', false);
    drawCell(row.femaleSlots ? String(row.femaleSlots) : '—', colX[1], currentY, colWidths[1], rowHeight, 'center', false);
    drawCell(row.maleSlots ? String(row.maleSlots) : '—', colX[2], currentY, colWidths[2], rowHeight, 'center', false);
    drawCell(formatVnd(round(row.amount)), colX[3], currentY, colWidths[3], rowHeight, 'right', false);
    currentY += rowHeight;
    drawRowBorder(currentY);
  }

  // 3. Neutral TỔNG SUẤT row
  ctx.fillStyle = '#f3f4f6';
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

  // 5. Neutral MỖI SUẤT row
  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(padX, currentY, tableWidth, rowHeight);
  drawCell('MỖI SUẤT', colX[0], currentY, colWidths[0], rowHeight, 'left', true);
  drawCell(formatVnd(round(input.femaleSlotRate)), colX[1], currentY, colWidths[1], rowHeight, 'center', true);
  drawCell(formatVnd(round(input.maleSlotRate)), colX[2], currentY, colWidths[2], rowHeight, 'center', true);
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
  return shareImageFile(blob, billFileName, text);
}

/**
 * Share a picture with its message: the system share sheet with the file when it takes files, else download the
 * picture and copy the message. 'shared' also covers a share sheet the person cancelled.
 */
export async function shareImageFile(
  blob: Blob | null,
  billFileName: string,
  text: string,
): Promise<'shared' | 'saved' | 'failed'> {
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

export interface SportPlanningCardInput {
  description: string;
  spentOn: string;
  groupName: string;
  location?: SportLocationSnapshot | null;
  courtSlots?: SportCourtSlot[];
  bookingCode?: string | null;
  totalDuration?: string | null;
  totalMaleSlots: number;
  totalFemaleSlots: number;
  rows: { name: string; femaleSlots: number; maleSlots: number }[];
  bookingImageDataUrl?: string | null;
  includeProofImage?: boolean;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function loadProofImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    } catch {
      resolve(null);
    }
  });
}

export async function renderSportPlanningPng(input: SportPlanningCardInput): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;

  let proofImg: HTMLImageElement | null = null;
  let isStyleB = Boolean(input.includeProofImage && input.bookingImageDataUrl);
  if (isStyleB) {
    proofImg = await loadProofImage(input.bookingImageDataUrl!);
    if (!proofImg) {
      isStyleB = false;
    }
  }

  const rowHeight = 56;
  const headerHeight = 140;
  const padX = 48;
  const curTableWidth = isStyleB ? 804 : 984;

  // Prepare venue box lines if present
  const venueLines: { text: string; font: string; color: string }[] = [];
  if (input.location?.name) {
    venueLines.push({
      text: input.location.name,
      font: 'bold 22px system-ui, -apple-system, sans-serif',
      color: '#111827',
    });
  }
  const locDetail = [
    input.location?.address && !input.location?.name.includes(input.location.address)
      ? input.location.address
      : null,
    input.location?.phone,
  ]
    .filter(Boolean)
    .join(' · ');
  if (locDetail) {
    venueLines.push({
      text: locDetail,
      font: '18px system-ui, -apple-system, sans-serif',
      color: '#4b5563',
    });
  }
  if (input.courtSlots && input.courtSlots.length > 0) {
    const slotsStr = input.courtSlots.map((s) => `${s.courtName} (${s.timeRange})`).join('  ·  ');
    venueLines.push({
      text: slotsStr,
      font: '18px system-ui, -apple-system, sans-serif',
      color: '#0f766e',
    });
  }
  if (input.bookingCode || input.totalDuration) {
    const metaStr = [
      input.bookingCode ? `Mã đặt: ${input.bookingCode}` : null,
      input.totalDuration ? `Thời gian: ${input.totalDuration}` : null,
    ]
      .filter(Boolean)
      .join('  ·  ');
    if (metaStr) {
      venueLines.push({
        text: metaStr,
        font: '16px system-ui, -apple-system, sans-serif',
        color: '#6b7280',
      });
    }
  }

  const hasVenueBox = venueLines.length > 0;
  const venueBoxPaddingY = 18;
  const venueLineGap = 8;
  const venueLineHeight = 24;
  const venueBoxHeight = hasVenueBox
    ? venueLines.length * venueLineHeight +
      (venueLines.length - 1) * venueLineGap +
      venueBoxPaddingY * 2
    : 0;

  const tableRows = 1 + input.rows.length + 1; // header + rows + total row
  const tableHeight = tableRows * rowHeight;
  const leftHeight = headerHeight + (hasVenueBox ? venueBoxHeight + 24 : 0) + tableHeight + 48;

  const canvas = document.createElement('canvas');
  const imgWidth = 540;
  if (isStyleB && proofImg) {
    const imgAspect = proofImg.width > 0 ? proofImg.height / proofImg.width : 1;
    const imgHeight = Math.round(imgWidth * imgAspect);
    canvas.width = 1488;
    canvas.height = Math.max(leftHeight, 48 + imgHeight + 48);
  } else {
    canvas.width = 1080;
    canvas.height = leftHeight;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Header Title & Subtitle
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(input.description, padX, 48);

  ctx.fillStyle = '#6b7280';
  ctx.font = '22px system-ui, -apple-system, sans-serif';
  ctx.fillText(`${input.spentOn} · ${input.groupName}`, padX, 96);

  // Jade Mist Badge (LÊN LỊCH · X SUẤT)
  const totalSlots = input.totalFemaleSlots + input.totalMaleSlots;
  const badgeText = `LÊN LỊCH · ${totalSlots} SUẤT`;
  ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
  const textWidth = ctx.measureText ? ctx.measureText(badgeText).width : 160;
  const badgeWidth = Math.max(textWidth + 28, 160);
  const badgeHeight = 36;
  const badgeRight = isStyleB ? padX + curTableWidth : canvas.width - padX;
  const badgeX = badgeRight - badgeWidth;
  const badgeY = 48;

  drawRoundedRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 18);
  ctx.fillStyle = '#ccfbf1';
  ctx.fill();
  ctx.fillStyle = '#134e4a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, badgeX + badgeWidth / 2, badgeY + badgeHeight / 2);

  let currentY = headerHeight;

  // Venue & Court Schedule Box
  if (hasVenueBox) {
    drawRoundedRect(ctx, padX, currentY, curTableWidth, venueBoxHeight, 14);
    ctx.fillStyle = '#efefeb';
    ctx.fill();
    let lineY = currentY + venueBoxPaddingY;
    for (const line of venueLines) {
      ctx.fillStyle = line.color;
      ctx.font = line.font;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(line.text, padX + 20, lineY);
      lineY += venueLineHeight + venueLineGap;
    }
    currentY += venueBoxHeight + 24;
  }

  // 3-Column Table
  const colWidths = isStyleB
    ? ([504, 150, 150] as const)
    : ([664, 160, 160] as const);
  const colX = [padX, padX + colWidths[0], padX + colWidths[0] + colWidths[1]] as const;

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
    ctx.lineTo(padX + curTableWidth, y);
    ctx.stroke();
  }

  // 1. Table Header
  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(padX, currentY, curTableWidth, rowHeight);
  drawRowBorder(currentY);
  drawCell('TÊN', colX[0], currentY, colWidths[0], rowHeight, 'left', true);
  drawCell('NỮ', colX[1], currentY, colWidths[1], rowHeight, 'center', true);
  drawCell('NAM', colX[2], currentY, colWidths[2], rowHeight, 'center', true);
  currentY += rowHeight;
  drawRowBorder(currentY);

  // 2. Participant Rows
  for (const row of input.rows) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(padX, currentY, curTableWidth, rowHeight);
    drawCell(row.name, colX[0], currentY, colWidths[0], rowHeight, 'left', false);
    drawCell(
      row.femaleSlots ? String(row.femaleSlots) : '—',
      colX[1],
      currentY,
      colWidths[1],
      rowHeight,
      'center',
      false,
    );
    drawCell(
      row.maleSlots ? String(row.maleSlots) : '—',
      colX[2],
      currentY,
      colWidths[2],
      rowHeight,
      'center',
      false,
    );
    currentY += rowHeight;
    drawRowBorder(currentY);
  }

  // 3. Footer Row: Neutral TỔNG SUẤT
  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(padX, currentY, curTableWidth, rowHeight);
  drawCell(`TỔNG SUẤT (${totalSlots} suất)`, colX[0], currentY, colWidths[0], rowHeight, 'left', true);
  drawCell(String(input.totalFemaleSlots), colX[1], currentY, colWidths[1], rowHeight, 'center', true);
  drawCell(String(input.totalMaleSlots), colX[2], currentY, colWidths[2], rowHeight, 'center', true);
  currentY += rowHeight;
  drawRowBorder(currentY);

  // Right column: Proof image for Style B
  if (isStyleB && proofImg) {
    const imgX = 900;
    const imgY = 48;
    const imgAspect = proofImg.width > 0 ? proofImg.height / proofImg.width : 1;
    const imgHeight = Math.round(imgWidth * imgAspect);

    ctx.save();
    drawRoundedRect(ctx, imgX, imgY, imgWidth, imgHeight, 16);
    ctx.clip();
    ctx.drawImage(proofImg, imgX, imgY, imgWidth, imgHeight);
    ctx.restore();

    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, imgX, imgY, imgWidth, imgHeight, 16);
    ctx.stroke();
  }

  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } catch {
      resolve(null);
    }
  });
}

export async function shareSportPlanning(
  input: SportPlanningCardInput,
  text: string,
  refCode: string,
): Promise<'shared' | 'saved' | 'failed'> {
  const blob = await renderSportPlanningPng(input);
  const planFileName = `plan-${(refCode || 'sport').replace(/\s+/g, '-')}.png`;

  if (blob && typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof File !== 'undefined') {
    const files = [new File([blob], planFileName, { type: 'image/png' })];
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
      a.download = planFileName;
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

export function compressBookingImage(file: Blob): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          URL.revokeObjectURL(url);
          const maxDim = 720;
          let width = img.width || 720;
          let height = img.height || 720;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, width, height);

          let dataUrl = canvas.toDataURL('image/webp', 0.75);
          if (dataUrl.length > 80_000) {
            dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          }
          if (dataUrl.length > 80_000) {
            dataUrl = canvas.toDataURL('image/jpeg', 0.5);
          }
          resolve(dataUrl);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
        resolve(null);
      };
      img.src = url;
    } catch {
      resolve(null);
    }
  });
}
