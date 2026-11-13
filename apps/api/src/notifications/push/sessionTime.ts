import type { SportCourtSlot } from '@cc/core';

const SLOT_START = /^(\d+)\s*(?::\s*(\d+)|(?:h|giờ)(?:\s*(\d+))?)(?!\d)/i;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ICT_OFFSET_HOURS = 7;

/** Parses the start clock time from a court-slot range such as `"05:00 - 07:00"` or `"9h30 - 11h"`. */
export function parseSlotStart(timeRange: string): { h: number; m: number } | null {
  const match = SLOT_START.exec(timeRange.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const rawMin = match[2] ?? match[3];
  const m = rawMin !== undefined ? Number(rawMin) : 0;
  if (!Number.isInteger(h) || h < 0 || h > 23 || !Number.isInteger(m) || m < 0 || m > 59) {
    return null;
  }
  return { h, m };
}

/** Earliest parsed start across `courtSlots` on `spentOn` in `Asia/Ho_Chi_Minh` (UTC+7), converted to UTC. */
export function sessionStartUtc(spentOn: string, courtSlots: SportCourtSlot[] | undefined): Date | null {
  if (!courtSlots || courtSlots.length === 0) return null;
  const dateMatch = DATE_RE.exec(spentOn);
  if (!dateMatch) return null;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);

  let earliest: { h: number; m: number } | null = null;
  for (const slot of courtSlots) {
    const parsed = parseSlotStart(slot.timeRange);
    if (!parsed) continue;
    if (!earliest || parsed.h * 60 + parsed.m < earliest.h * 60 + earliest.m) {
      earliest = parsed;
    }
  }
  if (!earliest) return null;

  return new Date(Date.UTC(year, month - 1, day, earliest.h - ICT_OFFSET_HOURS, earliest.m, 0, 0));
}
