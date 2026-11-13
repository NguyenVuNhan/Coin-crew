import { formatVnd } from '@cc/core';
import type { PushPayload } from './webPush';

/** Limits that keep the encrypted push well under the 4096-byte record. */
export const MAX_TITLE = 100;
export const MAX_BODY = 180;

/** Cuts `text` to at most `max` characters, ending in `…` when cut. */
export function clip(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, max - 1).join('')}…`;
}

export function expenseMessage(i: {
  actorName: string;
  description: string;
  groupName: string;
  share: number;
  tripId: string;
  rootId: string;
}): PushPayload {
  return {
    title: clip(`${i.actorName} thêm ${i.description} · ${i.groupName}`, MAX_TITLE),
    body: clip(`Phần của bạn ${formatVnd(i.share)}`, MAX_BODY),
    url: `/t/${i.tripId}/expenses/${i.rootId}`,
    tag: `expense:${i.rootId}`,
  };
}
