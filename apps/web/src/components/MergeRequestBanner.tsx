import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { IncomingMergeRequest } from '@fsl/core';
import { useT } from '../i18n';
import { apiSend } from '../api/client';
import { Button } from './Button';
import { InlineError } from './InlineError';
import { MergeConfirmSheet } from './MergeConfirmSheet';
import { cn } from '@/lib/utils';

export interface MergeRequestBannerProps {
  request: IncomingMergeRequest;
  autoOpen?: boolean;
}

export function MergeRequestBanner({ request, autoOpen = false }: MergeRequestBannerProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(autoOpen);
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
    <div
      className={cn(
        'fsl-merge-banner block rounded-xl bg-warning-soft text-warning-foreground p-4 box-border',
      )}
    >
      <p className="fsl-merge-banner__text m-0 mb-3 text-sm text-warning-foreground text-left break-words">
        {t('merge.incoming', { name: request.survivor.name, who })}
      </p>
      <div className="fsl-merge-banner__actions flex flex-row flex-wrap items-center justify-start gap-2">
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
        <InlineError error={error} className="fsl-merge-banner__error mt-2" />
      )}
      <MergeConfirmSheet
        request={request}
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
