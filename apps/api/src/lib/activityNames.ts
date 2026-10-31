import { inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import { participants, users } from '../db/schema';

/** D1 allows 100 bound parameters per query; stay well under it. */
const CHUNK = 90;

export interface ActivityNames {
  participants: Map<string, string>;
  users: Map<string, string>;
}

function chunks<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}

/**
 * Names for participant ids and user ids, one query per 90 ids of each kind.
 * Participants are looked up by id whatever their status, so a merged or removed name still shows.
 */
export async function loadActivityNames(
  db: Db,
  participantIds: Iterable<string>,
  userIds: Iterable<string>,
): Promise<ActivityNames> {
  const out: ActivityNames = { participants: new Map(), users: new Map() };
  for (const ids of chunks([...new Set(participantIds)])) {
    const rows = await db
      .select({ id: participants.id, name: participants.name })
      .from(participants)
      .where(inArray(participants.id, ids));
    for (const p of rows) out.participants.set(p.id, p.name);
  }
  for (const ids of chunks([...new Set(userIds)])) {
    const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids));
    for (const u of rows) out.users.set(u.id, u.name);
  }
  return out;
}

/** The actor's name in that group, else their account name, else null. */
export function actorName(
  names: ActivityNames,
  row: { actorParticipantId: string | null; actorUserId: string | null },
): string | null {
  return (
    (row.actorParticipantId ? names.participants.get(row.actorParticipantId) : undefined) ??
    (row.actorUserId ? names.users.get(row.actorUserId) : undefined) ??
    null
  );
}
