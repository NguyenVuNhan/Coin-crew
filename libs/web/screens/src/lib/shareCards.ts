import type { TripView } from '@cc/core';
import { t } from '@cc/web-i18n';
import type { ShareCard } from '@cc/web-platform';
import { linkTokens } from '@cc/web-util/linkTokens';

export function clip(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

export function groupToken(view: TripView): string {
  return view.links?.group ?? linkTokens.get(view.trip.id) ?? '';
}

export function thumbnailFor(view: TripView, origin: string): string {
  return view.trip.preset === 'sport' ? `${origin}/og/sport.png` : `${origin}/og/trip.png`;
}

export function inviteCard(view: TripView, origin: string): ShareCard {
  const token = encodeURIComponent(groupToken(view));
  return {
    title: clip(t('share.inviteTitle', { trip: view.trip.name }), 100),
    description: clip(t('share.inviteDescription'), 400),
    path: `j/${token}`,
    thumbnailUrl: thumbnailFor(view, origin),
    text: t('invite.shareText', { trip: view.trip.name }),
    url: `${origin}/j/${token}`,
  };
}

export function remindCard(view: TripView, text: string, origin: string): ShareCard {
  const token = encodeURIComponent(groupToken(view));
  return {
    title: clip(t('share.remindTitle', { trip: view.trip.name }), 100),
    description: clip(text, 400),
    path: `j/${token}`,
    thumbnailUrl: thumbnailFor(view, origin),
    text,
    url: `${origin}/j/${token}`,
  };
}

/**
 * The Mini App's "Share bill & QR" card. It opens the same address as the web's bill link (`expenseLink`):
 * `/j/<token>/e/<rootId>` goes on to the pay screen (your share and the QR), never to the bill page with only a share
 * button (spec §4.2). Pass the bill's root id, so a card already in the chat still works after the bill is edited.
 */
export function sportBillCard(
  view: TripView,
  rootExpenseId: string,
  text: string,
  origin: string,
): ShareCard {
  const token = encodeURIComponent(groupToken(view));
  const encExpenseId = encodeURIComponent(rootExpenseId);
  return {
    title: clip(t('share.sportTitle', { trip: view.trip.name }), 100),
    description: clip(text, 400),
    path: `j/${token}/e/${encExpenseId}`,
    thumbnailUrl: `${origin}/og/sport.png`,
    text,
    url: `${origin}/j/${token}/e/${encExpenseId}`,
  };
}

export function requestCard(url: string, title: string): ShareCard {
  const u = new URL(url);
  const path = u.pathname.replace(/^\//, '') + u.search;
  return {
    title: clip(title, 100),
    description: clip(t('share.requestDescription'), 400),
    path,
    thumbnailUrl: `${u.origin}/og/trip.png`,
    text: url,
    url,
  };
}
