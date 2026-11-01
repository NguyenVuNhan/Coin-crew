import { formatVnd, type TripView, type Gender } from '@fsl/core';
import type { Lang } from '../i18n';
import { en } from '../i18n/en';
import { vi } from '../i18n/vi';
import { linkTokens } from './linkTokens';

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
}

export function sportShareText(lang: Lang, input: SportShareTextInput): string {
  const parts: string[] = [];

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
        ? `Nam đóng ${formatVnd(input.maleSlotRate)}, nữ đóng ${formatVnd(input.femaleSlotRate)}`
        : `Men pay ${formatVnd(input.maleSlotRate)}, women pay ${formatVnd(input.femaleSlotRate)}`,
    );
  } else {
    const r = input.totalMaleSlots > 0 ? input.maleSlotRate : input.femaleSlotRate;
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
          ? `riêng ${p.name} đóng ${formatVnd(p.amount)}`
          : `except ${p.name} pays ${formatVnd(p.amount)}`,
      );
    }
  }

  if (parts[0] !== undefined) {
    parts[0] = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    return `${parts.join(', ')}${lang === 'vi' ? '. Mã QR & chi tiết: ' : '. QR & details: '}${input.link}`;
  }

  return `${lang === 'vi' ? 'Mã QR & chi tiết: ' : 'QR & details: '}${input.link}`;
}

/** The group link that goes into a reminder: a member's view carries it, a guest still has the link they came by. */
export function groupLink(view: TripView): string {
  const token = view.links?.group ?? linkTokens.get(view.trip.id) ?? '';
  return `${typeof window !== 'undefined' ? window.location.origin : ''}/j/${token}`;
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
