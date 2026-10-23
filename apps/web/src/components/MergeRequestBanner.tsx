import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { IncomingMergeRequest } from '@fsl/core';
import { useT } from '../i18n';
import { apiSend } from '../api/client';
import { Button } from './Button';
import { InlineError } from './InlineError';
import { MergeConfirmSheet } from './MergeConfirmSheet';
import './MergeRequestBanner.css';

export interface MergeRequestBannerProps {
  request: IncomingMergeRequest;
}

export function MergeRequestBanner({ request }: MergeRequestBannerProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const who = request.survivor.email ?? 'Zalo';

  const handleDecline = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/me/merge-requests/${request.id}/decline`, 'POST');
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fsl-merge-banner">
      <p className="fsl-merge-banner__text">
        {t('merge.incoming', { name: request.survivor.name, who })}
      </p>
      <div className="fsl-merge-banner__actions">
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => setOpen(true)}
        >
          {t('merge.review')}
        </Button>
        <Button
          variant="secondary"
          loading={busy}
          onClick={handleDecline}
        >
          {t('merge.decline')}
        </Button>
      </div>
      {error !== null && (
        <InlineError error={error} className="fsl-merge-banner__error" />
      )}
      <MergeConfirmSheet
        request={request}
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
