import { formatVnd, type PushLeadMinutes } from '@cc/core';
import type { PushPayload } from './webPush';

/** Limits that keep the encrypted push well under the 4096-byte record. */
export const MAX_TITLE = 100;
export const MAX_BODY = 180;

const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;

// REVIEW
const WEEKDAYS = ['Chủ nhật', 'thứ Hai', 'thứ Ba', 'thứ Tư', 'thứ Năm', 'thứ Sáu', 'thứ Bảy'] as const;

// REVIEW
const LEAD_LABELS: Record<PushLeadMinutes, string> = {
  15: '15 phút',
  30: '30 phút',
  60: '1 giờ',
  120: '2 giờ',
};

/** Cuts `text` to at most `max` characters, ending in `…` when cut. */
export function clip(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, max - 1).join('')}…`;
}

function formatStartIct(startUtc: string | null): string | null {
  if (!startUtc) return null;
  const ms = Date.parse(startUtc);
  if (Number.isNaN(ms)) return null;
  const ict = new Date(ms + ICT_OFFSET_MS);
  const hh = String(ict.getUTCHours()).padStart(2, '0');
  const mm = String(ict.getUTCMinutes()).padStart(2, '0');
  const weekday = WEEKDAYS[ict.getUTCDay()]!;
  return `${hh}:${mm} ${weekday}`;
}

function joinParts(parts: (string | null | undefined)[]): string {
  return parts
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p))
    .join(' · ');
}

export function expenseMessage(i: {
  actorName: string;
  description: string;
  groupName: string;
  share: number;
  tripId: string;
  rootId: string;
}): PushPayload {
  const actor = i.actorName.trim() || 'Có người';
  return {
    title: clip(`${actor} thêm ${i.description} · ${i.groupName}`, MAX_TITLE),
    body: clip(`Phần của bạn ${formatVnd(i.share)}`, MAX_BODY),
    url: `/t/${i.tripId}/expenses/${i.rootId}`,
    tag: `expense:${i.rootId}`,
  };
}

export function newSessionMessage(i: {
  description: string;
  locationName: string | null;
  startUtc: string | null;
  male: number;
  female: number;
  tripId: string;
  rootId: string;
}): PushPayload {
  // REVIEW
  const genderParts = [i.male > 0 ? `${i.male} Nam` : null, i.female > 0 ? `${i.female} Nữ` : null].filter(
    (p): p is string => Boolean(p),
  );
  const genderText = genderParts.length > 0 ? genderParts.join(', ') : null;
  return {
    // REVIEW
    title: clip(`${i.description} · bạn có tên`, MAX_TITLE),
    body: clip(joinParts([i.locationName, formatStartIct(i.startUtc), genderText]), MAX_BODY),
    url: `/t/${i.tripId}/expenses/${i.rootId}`,
    tag: `session:${i.rootId}`,
  };
}

export function changedSessionMessage(i: {
  description: string;
  tripId: string;
  rootId: string;
  locationName: string | null;
  startUtc: string | null;
}): PushPayload {
  return {
    // REVIEW
    title: clip(`${i.description} đổi giờ hoặc địa điểm`, MAX_TITLE),
    body: clip(joinParts([i.locationName, formatStartIct(i.startUtc)]), MAX_BODY),
    url: `/t/${i.tripId}/expenses/${i.rootId}`,
    tag: `session:${i.rootId}`,
  };
}

export function reminderMessage(i: {
  description: string;
  leadMinutes: PushLeadMinutes;
  locationName: string | null;
  courts: string | null;
  timeRange: string | null;
  tripId: string;
  rootId: string;
}): PushPayload {
  const lead = LEAD_LABELS[i.leadMinutes];
  return {
    // REVIEW
    title: clip(`Còn ${lead} nữa: ${i.description}`, MAX_TITLE),
    body: clip(joinParts([i.locationName, i.courts, i.timeRange]), MAX_BODY),
    url: `/t/${i.tripId}/expenses/${i.rootId}`,
    tag: `reminder:${i.rootId}`,
  };
}
