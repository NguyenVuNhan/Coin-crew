import {
  formatVnd,
  roundToThousand,
  type TripView,
  type Gender,
  type SportLocationSnapshot,
  type SportCourtSlot,
} from '@cc/core';
import type { Lang } from '@cc/web-i18n';
import { en } from '@cc/web-i18n/en';
import { vi } from '@cc/web-i18n/vi';
import { linkTokens } from '@cc/web-util/linkTokens';
import { appOrigin } from '@cc/web-platform/session';

export interface SportShareParticipant {
  participantId: string;
  name: string;
  rosterGender?: Gender | null;
  maleSlots: number;
  femaleSlots: number;
  fixedAmount?: number | null;
  amount: number;
}

export interface SportShareTextInput {
  court: number;
  shuttlecocksTotal: number;
  extra: number;
  maleSlotRate: number;
  femaleSlotRate: number;
  totalMaleSlots: number;
  totalFemaleSlots: number;
  participants: SportShareParticipant[];
  link: string;
  roundTransfers?: boolean;
}

export function sportShareText(lang: Lang, input: SportShareTextInput): string {
  const parts: string[] = [];
  const round = input.roundTransfers ? roundToThousand : (v: number) => v;

  if (input.court > 0) {
    parts.push(lang === 'vi' ? `Sân ${formatVnd(input.court)}` : `Court ${formatVnd(input.court)}`);
  }
  if (input.shuttlecocksTotal > 0) {
    parts.push(lang === 'vi' ? `cầu ${formatVnd(input.shuttlecocksTotal)}` : `shuttlecocks ${formatVnd(input.shuttlecocksTotal)}`);
  }
  if (input.extra > 0) {
    parts.push(lang === 'vi' ? `phụ phí ${formatVnd(input.extra)}` : `extra fee ${formatVnd(input.extra)}`);
  }

  if (
    input.totalMaleSlots > 0 &&
    input.totalFemaleSlots > 0 &&
    input.maleSlotRate !== input.femaleSlotRate
  ) {
    parts.push(
      lang === 'vi'
        ? `Nam đóng ${formatVnd(round(input.maleSlotRate))}, nữ đóng ${formatVnd(round(input.femaleSlotRate))}`
        : `Men pay ${formatVnd(round(input.maleSlotRate))}, women pay ${formatVnd(round(input.femaleSlotRate))}`,
    );
  } else {
    const r = round(input.totalMaleSlots > 0 ? input.maleSlotRate : input.femaleSlotRate);
    parts.push(
      lang === 'vi'
        ? `mỗi suất đóng ${formatVnd(r)}`
        : `each pays ${formatVnd(r)}`,
    );
  }

  for (const p of input.participants) {
    const isFixed = p.fixedAmount !== null && p.fixedAmount !== undefined;
    const multiSlots = p.maleSlots + p.femaleSlots > 1;
    const ratesDiffer = input.maleSlotRate !== input.femaleSlotRate;
    const genderFlip =
      ratesDiffer &&
      ((p.rosterGender === 'M' && p.femaleSlots === 1 && p.maleSlots === 0) ||
        (p.rosterGender === 'F' && p.maleSlots === 1 && p.femaleSlots === 0));

    if (isFixed || multiSlots || genderFlip) {
      parts.push(
        lang === 'vi'
          ? `riêng ${p.name} đóng ${formatVnd(round(p.amount))}`
          : `except ${p.name} pays ${formatVnd(round(p.amount))}`,
      );
    }
  }

  if (parts[0] !== undefined) {
    parts[0] = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    return `${parts.join(', ')}${lang === 'vi' ? '. Mã QR & chi tiết: ' : '. QR & details: '}${input.link}`;
  }

  return `${lang === 'vi' ? 'Mã QR & chi tiết: ' : 'QR & details: '}${input.link}`;
}

export interface SportPlanningShareTextInput {
  description?: string;
  spentOn?: string;
  location?: SportLocationSnapshot | null;
  courtSlots?: SportCourtSlot[];
  bookingCode?: string | null;
  totalDuration?: string | null;
  totalFemaleSlots: number;
  totalMaleSlots: number;
  link: string;
}

export function sportPlanningShareText(lang: Lang, input: SportPlanningShareTextInput): string {
  const lines: string[] = [];
  if (input.description) {
    lines.push(input.description);
  }
  if (input.spentOn) {
    lines.push(lang === 'vi' ? `Ngày: ${input.spentOn}` : `Date: ${input.spentOn}`);
  }
  if (input.location?.name) {
    const loc =
      input.location.address && !input.location.name.includes(input.location.address)
        ? `${input.location.name} - ${input.location.address}`
        : input.location.name;
    lines.push(lang === 'vi' ? `Địa điểm: ${loc}` : `Venue: ${loc}`);
  }
  if (input.location?.mapUrl) {
    lines.push(input.location.mapUrl);
  }
  if (input.courtSlots && input.courtSlots.length > 0) {
    const slots = input.courtSlots.map((s) => `${s.courtName} (${s.timeRange})`).join(', ');
    lines.push(lang === 'vi' ? `Sân: ${slots}` : `Courts: ${slots}`);
  }
  const totalSlots = input.totalFemaleSlots + input.totalMaleSlots;
  const slotCount =
    lang === 'vi'
      ? `${totalSlots} suất (${input.totalFemaleSlots} Nữ, ${input.totalMaleSlots} Nam)`
      : `${totalSlots} slots (${input.totalFemaleSlots}F, ${input.totalMaleSlots}M)`;
  lines.push(lang === 'vi' ? `Danh sách: ${slotCount}` : `Headcount: ${slotCount}`);

  if (input.bookingCode || input.totalDuration) {
    const meta = [
      input.bookingCode ? (lang === 'vi' ? `Mã đặt: ${input.bookingCode}` : `Booking code: ${input.bookingCode}`) : null,
      input.totalDuration ? (lang === 'vi' ? `Thời gian: ${input.totalDuration}` : `Duration: ${input.totalDuration}`) : null,
    ]
      .filter(Boolean)
      .join(' · ');
    if (meta) lines.push(meta);
  }
  if (input.link) {
    lines.push(lang === 'vi' ? `Chi tiết: ${input.link}` : `Details: ${input.link}`);
  }
  return lines.join('\n');
}

/** The group link that goes into a reminder: a member's view carries it, a guest still has the link they came by. */
export function groupLink(view: TripView): string {
  const token = view.links?.group ?? linkTokens.get(view.trip.id) ?? '';
  return `${appOrigin()}/j/${token}`;
}

/** The link a "pay me" reminder carries: it opens on what the visitor owes (rewrite spec §4.1). */
export function payLink(view: TripView): string {
  return `${groupLink(view)}/owe`;
}

export function expenseLink(view: TripView, id: string): string {
  const token = view.links?.group ?? linkTokens.get(view.trip.id);
  if (!token) return groupLink(view);
  return `${groupLink(view)}/e/${encodeURIComponent(id)}`;
}

export function remindText(
  lang: Lang,
  vars: { name: string; creditor: string; amount: string; trip: string; link: string },
): string {
  const dict = lang === 'vi' ? vi : en;
  let msg = dict['remind.text'];
  for (const [key, value] of Object.entries(vars)) {
    msg = msg.replaceAll(`{${key}}`, value);
  }
  return msg;
}

export async function remind(text: string): Promise<'shared' | 'copied' | 'failed'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return 'shared';
      }
    }
  }

  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch {
      return 'failed';
    }
  }

  return 'failed';
}
