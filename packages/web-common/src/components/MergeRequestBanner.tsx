import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { IncomingMergeRequest, JoiningMergeRequest } from '@fsl/core';
import { useT } from '../i18n';
import { apiSend } from '../api/client';
import { Button } from './Button';
import { InlineError } from './InlineError';
import { MergeConfirmSheet } from './MergeConfirmSheet';
import { JoinRequestSheet } from './JoinRequestSheet';
import { cn } from '@/lib/utils';

export interface JoinRequestBannerProps {
  request: JoiningMergeRequest;
  autoOpen?: boolean;
  onAccepted?: () => void;
}

export function JoinRequestBanner({ request, autoOpen = false, onAccepted }: JoinRequestBannerProps) {
  const t = useT();
  const [open, setOpen] = useState(autoOpen);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'fsl-merge-banner fsl-join-banner block w-full text-left min-h-11 rounded-xl bg-warning-soft text-warning-foreground p-4 box-border cursor-pointer transition-colors hover:bg-warning-soft/80',
        )}
      >
        <p className="fsl-merge-banner__text m-0 text-sm text-warning-foreground text-left break-words">
          {t('join.banner', { name: request.zalo.name })}
        </p>
      </button>
      <JoinRequestSheet
        request={request}
        open={open}
        onClose={() => setOpen(false)}
        onAccepted={onAccepted}
      />
    </>
  );
}

export interface IncomingMergeBannerProps {
  request: IncomingMergeRequest;
  autoOpen?: boolean;
}

export function IncomingMergeBanner({ request, autoOpen = false }: IncomingMergeBannerProps) {
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

export interface MergeRequestBannerProps {
  request: IncomingMergeRequest | JoiningMergeRequest;
  autoOpen?: boolean;
  onAccepted?: () => void;
}

export function MergeRequestBanner({ request, autoOpen = false, onAccepted }: MergeRequestBannerProps) {
  if ('zalo' in request) {
    return <JoinRequestBanner request={request} autoOpen={autoOpen} onAccepted={onAccepted} />;
  }
  return <IncomingMergeBanner request={request} autoOpen={autoOpen} />;
}
