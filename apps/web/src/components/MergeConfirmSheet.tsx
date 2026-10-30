import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { IncomingMergeRequest } from '@fsl/core';
import { cn } from '@/lib/utils';
import { useT } from '../i18n';
import { apiSend } from '../api/client';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { InlineError } from './InlineError';

export interface MergeConfirmSheetProps {
  request: IncomingMergeRequest;
  open: boolean;
  onClose: () => void;
}

export function MergeConfirmSheet({ request, open, onClose }: MergeConfirmSheetProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/me/merge-requests/${request.id}/accept`, 'POST');
      await queryClient.resetQueries();
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    if (busy) return;
    setError(null);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      dismissible={!busy}
      title={t('merge.confirmTitle')}
      className="fsl-merge-sheet"
    >
      <div className={cn('fsl-merge-sheet__body', 'flex flex-col gap-3 text-left')}>
        <p className={cn('fsl-merge-sheet__moves', 'm-0 text-base leading-normal text-foreground')}>
          {t('merge.moves', { groups: request.groups.merged, name: request.survivor.name })}
        </p>

        {request.released && request.released.length > 0 && (
          <ul className={cn('fsl-merge-sheet__released', 'm-0 p-0 list-none divide-y divide-border')}>
            {request.released.map((r) => (
              <li
                key={`${r.provider}-${r.email}`}
                className={cn('fsl-merge-sheet__released-item', 'py-2 text-sm leading-5 text-muted-foreground')}
              >
                {t('merge.released', {
                  provider: r.provider === 'google' ? 'Google' : 'Zalo',
                  email: r.email ?? '',
                })}
              </li>
            ))}
          </ul>
        )}

        {error !== null && <InlineError error={error} />}

        <div className={cn('fsl-merge-sheet__actions', 'flex flex-col gap-2')}>
          <Button
            variant="danger"
            block
            loading={busy}
            onClick={handleConfirm}
          >
            {t('merge.confirm')}
          </Button>
          <Button
            variant="secondary"
            block
            disabled={busy}
            onClick={handleClose}
          >
            {t('merge.cancel')}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
