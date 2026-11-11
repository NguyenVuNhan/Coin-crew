import { Hono } from 'hono';
import { pairHistory, type HistoryPlace, type PairHistory, type PersonHistoryView, type PersonKey } from '@cc/core';
import type { AppBindings } from '@cc/api-db/env';
import { getDb, type Db } from '@cc/api-db/client';
import { getSessionUser, requireUser } from '@cc/api-auth/session';
import type { TripRow } from '@cc/api-auth/actor';
import { ApiError } from '@cc/api-util/errors';
import type { TripSnapshot } from '../trips/snapshot';
import { loadPeopleIndex, loadPersonItems, type PersonItems } from './balances';

function parseKey(raw: string): PersonKey {
  if (/^[up]:.+$/.test(raw)) return raw as PersonKey;
  throw new ApiError('NOT_FOUND', 404);
}

function historyOf(trip: TripRow, snapshot: TripSnapshot, ownerPid: string, otherPid: string): PairHistory {
  return pairHistory({
    tripId: trip.id,
    ownerPid,
    otherPid,
    expenses: snapshot.expenses,
    payments: snapshot.payments,
    suggestions: snapshot.suggestions,
    roundTransfers: trip.roundTransfers === 1,
  });
}

function sourceOf(userId: string, person: PersonItems, trip: TripRow, personPid: string): HistoryPlace['source'] {
  if (trip.preset !== 'direct') return 'group';
  if (trip.organiserUserId !== userId) return 'theirs';
  return person.ledger?.tripId === trip.id && person.ledger.personPid === personPid ? 'own' : 'merged';
}

/**
 * Mode 'all': every open item with the person becomes a place; ledgers carry their lines, groups
 * don't (the group screen shows those). No queries beyond loadPersonItems.
 */
export async function loadPersonHistory(db: Db, userId: string, key: PersonKey): Promise<PersonHistoryView | null> {
  const person = await loadPersonItems(db, userId, key);
  if (!person) return null;
  const places: HistoryPlace[] = [];
  for (const item of person.items) {
    const trip = person.trips.get(item.tripId);
    const snapshot = person.snapshots.get(item.tripId);
    if (!trip || !snapshot) continue;
    places.push({
      tripId: item.tripId,
      tripName: item.tripName,
      kind: item.kind,
      source: sourceOf(userId, person, trip, item.personPid),
      amount: item.amount,
      history: item.kind === 'direct' ? historyOf(trip, snapshot, item.ownerPid, item.personPid) : null,
    });
  }
  return {
    key: person.key,
    name: person.name,
    mode: 'all',
    total: places.reduce((sum, p) => sum + p.amount, 0),
    places,
  };
}

/**
 * Mode 'group': the lines with one participant in one trip, under the person it stands for.
 * loadPeopleIndex (four fixed queries) plus loadPersonItems.
 */
export async function loadTripPersonHistory(db: Db, userId: string, tripId: string, pid: string): Promise<PersonHistoryView | null> {
  const index = await loadPeopleIndex(db, userId);
  const row = index.mine.find((r) => r.trip.id === tripId);
  if (!row || index.byPid.get(pid)?.trip_id !== tripId) return null;
  const resolved = index.resolve(pid, row.trip);
  if (!resolved) return null;
  const person = await loadPersonItems(db, userId, resolved.key);
  const trip = person?.trips.get(tripId);
  const snapshot = person?.snapshots.get(tripId);
  if (!person || !trip || !snapshot) return null;

  const item = person.items.find((i) => i.tripId === tripId && i.personPid === pid);
  const kind = trip.preset === 'direct' ? 'direct' : 'group';
  const place: HistoryPlace = {
    tripId,
    tripName: trip.name,
    kind,
    source: sourceOf(userId, person, trip, pid),
    amount: item?.amount ?? 0,
    history: historyOf(trip, snapshot, row.myPid, pid),
  };
  return { key: person.key, name: person.name, mode: 'group', total: place.amount, places: [place] };
}

export function historyRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/me/people/:key/history', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    const view = await loadPersonHistory(getDb(c.env), user.id, parseKey(c.req.param('key')));
    if (!view) throw new ApiError('NOT_FOUND', 404);
    return c.json<PersonHistoryView>(view);
  });

  app.get('/me/trips/:tripId/people/:pid/history', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    const view = await loadTripPersonHistory(getDb(c.env), user.id, c.req.param('tripId'), c.req.param('pid'));
    if (!view) throw new ApiError('NOT_FOUND', 404);
    return c.json<PersonHistoryView>(view);
  });

  return app;
}
