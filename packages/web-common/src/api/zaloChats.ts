import { useQuery } from '@tanstack/react-query';
import type { ZaloChatLookup } from '@fsl/core';
import { apiFetch, apiSend } from './client';

export interface TripZaloChatsResponse {
  chats: { chatId: string; createdAt: string }[];
}

export async function lookupZaloChat(chatId: string): Promise<ZaloChatLookup> {
  return apiFetch<ZaloChatLookup>(`/api/zalo/chats/${encodeURIComponent(chatId)}`);
}

export async function linkZaloChat(chatId: string, tripId: string): Promise<void> {
  return apiSend<void>(`/api/zalo/chats/${encodeURIComponent(chatId)}/link`, 'POST', { tripId });
}

export async function unlinkZaloChat(chatId: string): Promise<void> {
  return apiSend<void>(`/api/zalo/chats/${encodeURIComponent(chatId)}`, 'DELETE');
}

export async function getTripZaloChats(tripId: string): Promise<TripZaloChatsResponse> {
  return apiFetch<TripZaloChatsResponse>(`/api/trips/${encodeURIComponent(tripId)}/zalo-chats`);
}

export function useTripZaloChats(tripId: string, enabled = true) {
  return useQuery<TripZaloChatsResponse>({
    queryKey: ['trip-zalo-chats', tripId],
    queryFn: () => getTripZaloChats(tripId),
    enabled: enabled && !!tripId,
  });
}
