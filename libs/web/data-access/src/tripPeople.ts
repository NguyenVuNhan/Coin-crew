import type { Gender } from '@cc/core';
import { apiSend } from './client';

/** Adds one person to a group (`POST /api/trips/:id/people`, with the link token) and resolves with their id. */
export async function addTripPerson(tripId: string, input: { name: string; gender?: Gender }): Promise<string> {
  const res = await apiSend<{ participantId: string }>(
    `/api/trips/${encodeURIComponent(tripId)}/people`,
    'POST',
    input,
    tripId,
  );
  return res.participantId;
}

/** Removes one person from a group (`DELETE /api/trips/:id/people/:participantId`), e.g. to undo an add. */
export async function removeTripPerson(tripId: string, participantId: string): Promise<void> {
  await apiSend<void>(
    `/api/trips/${encodeURIComponent(tripId)}/people/${encodeURIComponent(participantId)}`,
    'DELETE',
    undefined,
    tripId,
  );
}
