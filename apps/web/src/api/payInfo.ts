import { useQuery } from '@tanstack/react-query';
import type { PayInfo } from '@fsl/core';
import { apiFetch } from './client';

/**
 * What to pay `toId`, or, with `fromId` (and the viewer being `toId`), what `fromId` owes the viewer with the viewer's
 * own bank. `version` is the trip's version: a new one fetches again, so a QR never outlives a change of debt.
 */
export function usePayInfo({
  tripId,
  toId,
  fromId,
  enabled,
  version,
}: {
  tripId: string;
  toId: string;
  fromId?: string;
  enabled: boolean;
  version: number;
}) {
  return useQuery<PayInfo>({
    queryKey: ['pay', tripId, toId, fromId ?? 'me', version],
    queryFn: () => apiFetch<PayInfo>(`/api/trips/${tripId}/pay/${toId}${fromId ? `?from=${fromId}` : ''}`, { tripId }),
    enabled,
  });
}
