import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { TripView } from '@fsl/core';
import { useT } from '../i18n';
import { apiSend } from '../api/client';
import { Button } from './Button';
import { InlineError } from './InlineError';

/** The receiver marks money as arrived without waiting for the payer's claim (spec §9.4); it counts straight away. */
export function ReceivedButton({ view, fromId, amount }: { view: TripView; fromId: string; amount: number }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const tripId = view.trip.id;
  const me = view.me.participantId;
  if (!me || view.trip.archived) return null;

  async function received() {
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/trips/${tripId}/payments`, 'POST', { fromId, toId: me, amount }, tripId);
      await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" loading={busy} onClick={received}>{t('whoPays.received')}</Button>
      {error ? <InlineError error={error} /> : null}
    </>
  );
}
