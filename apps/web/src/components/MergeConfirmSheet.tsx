import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { IncomingMergeRequest } from '@fsl/core';
import { useT } from '../i18n';
import { apiSend } from '../api/client';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { InlineError } from './InlineError';
import './MergeRequestBanner.css';

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
      <div className="fsl-merge-sheet__body">
        <p className="fsl-merge-sheet__moves">
          {t('merge.moves', { groups: request.groups.merged, name: request.survivor.name })}
        </p>

        {request.released && request.released.length > 0 && (
          <ul className="fsl-merge-sheet__released">
            {request.released.map((r) => (
              <li key={`${r.provider}-${r.email}`} className="fsl-merge-sheet__released-item">
                {t('merge.released', {
                  provider: r.provider === 'google' ? 'Google' : 'Zalo',
                  email: r.email ?? '',
                })}
              </li>
            ))}
          </ul>
        )}

        {error !== null && <InlineError error={error} />}

        <div className="fsl-merge-sheet__actions">
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
