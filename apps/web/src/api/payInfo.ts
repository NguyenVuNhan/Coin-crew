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
  bill,
  enabled,
  version,
}: {
  tripId: string;
  toId: string;
  fromId?: string;
  bill?: boolean;
  enabled: boolean;
  version: number;
}) {
  const params = new URLSearchParams();
  if (fromId) params.set('from', fromId);
  if (bill) params.set('bill', '1');
  const qs = params.toString() ? `?${params.toString()}` : '';

  return useQuery<PayInfo>({
    queryKey: ['pay', tripId, toId, fromId ?? 'me', bill ? 'bill' : 'pair', version],
    queryFn: () => apiFetch<PayInfo>(`/api/trips/${tripId}/pay/${toId}${qs}`, { tripId }),
    enabled,
  });
}
