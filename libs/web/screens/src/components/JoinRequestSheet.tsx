import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatVnd, type JoiningMergeRequest } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { apiSend } from '@cc/web-data-access/client';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Avatar } from '@cc/web-ui/components/Avatar';
import { Button } from '@cc/web-ui/components/Button';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Snackbar } from '@cc/web-ui/components/Snackbar';
import { cn } from '@cc/web-ui/lib/utils';

export interface JoinRequestSheetProps {
  request: JoiningMergeRequest;
  open: boolean;
  onClose: () => void;
  onAccepted?: () => void;
}

export function JoinRequestSheet({
  request,
  open,
  onClose,
  onAccepted,
}: JoinRequestSheetProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [snackbar, setSnackbar] = useState(false);
  const [lastAction, setLastAction] = useState<'accept' | 'decline' | null>(null);

  useEffect(() => {
    if (!snackbar) return;
    const timer = setTimeout(() => setSnackbar(false), 4000);
    return () => clearTimeout(timer);
  }, [snackbar]);

  const handleAccept = async () => {
    setBusy(true);
    setError(null);
    setLastAction('accept');
    try {
      await apiSend(`/api/me/merge-requests/${request.id}/accept`, 'POST');
      onAccepted?.();
      setSnackbar(true);
      onClose();
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      await queryClient.invalidateQueries({ queryKey: ['trips'] });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleDecline = async () => {
    setBusy(true);
    setError(null);
    setLastAction('decline');
    try {
      await apiSend(`/api/me/merge-requests/${request.id}/decline`, 'POST');
      onClose();
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      await queryClient.invalidateQueries({ queryKey: ['trips'] });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleRetry = () => {
    if (lastAction === 'decline') {
      void handleDecline();
    } else {
      void handleAccept();
    }
  };

  const handleClose = () => {
    if (busy) return;
    setError(null);
    onClose();
  };

  const hasGroups = Boolean(request.groups && request.groups.length > 0);
  const hasCollapsing = Boolean(request.collapsing && request.collapsing.length > 0);
  const autoConfirm = request.autoConfirm ?? [];
  const hasAutoConfirm = autoConfirm.length > 0;

  return (
    <>
      <Sheet
        open={open}
        onClose={handleClose}
        dismissible={!busy}
        title={t('join.title')}
        className="fsl-join-sheet"
      >
        <div
          data-testid="join-request-sheet"
          className={cn('fsl-join-sheet__body', 'flex flex-col gap-4 text-left')}
        >
          <div className="flex items-center gap-3">
            <Avatar name={request.zalo.name} avatarUrl={request.zalo.avatarUrl} size="md" />
            <span className="text-base font-semibold text-foreground">
              {request.zalo.name}
            </span>
          </div>

          <p className="m-0 text-base leading-normal text-muted-foreground">
            {t('join.body')}
          </p>

          {(hasGroups || hasCollapsing || hasAutoConfirm) && (
            <div className="rounded-xl bg-warning-soft px-4 py-3 text-warning-foreground flex flex-col gap-2">
              {hasGroups && (
                <>
                  <p className="m-0 text-sm font-semibold">
                    {t('join.groupsMove')}
                  </p>
                  <ul className="m-0 p-0 list-none text-sm flex flex-col gap-1">
                    {request.groups.map((g) => (
                      <li key={g.tripId}>{g.name}</li>
                    ))}
                  </ul>
                </>
              )}
              {hasCollapsing && (
                <div className="flex flex-col gap-1">
                  {request.collapsing.map((c) => (
                    <p key={c.tripId} className="m-0 text-sm">
                      {t('join.collapse', {
                        group: c.name,
                        zaloPersonName: c.zaloPersonName,
                        yourPersonName: c.yourPersonName,
                      })}
                    </p>
                  ))}
                </div>
              )}
              {hasAutoConfirm && (
                <div data-testid="join-auto-confirm" className="fsl-join-sheet__auto-confirm flex flex-col gap-1">
                  <p className="m-0 text-sm font-semibold">{t('join.autoConfirm')}</p>
                  <ul className="m-0 p-0 list-none text-sm flex flex-col gap-1 tabular-nums">
                    {autoConfirm.map((a) => (
                      <li key={a.paymentId}>
                        {t('join.autoConfirmRow', { amount: formatVnd(a.amount), to: a.toName, group: a.tripName })}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {error !== null && (
            <InlineError error={error} onRetry={handleRetry} />
          )}

          <div className="flex flex-col gap-2 pt-2">
            <Button
              variant="primary"
              block
              loading={busy}
              disabled={busy}
              onClick={handleAccept}
            >
              {t('join.accept')}
            </Button>
            <Button
              variant="ghost"
              block
              disabled={busy}
              onClick={handleDecline}
            >
              {t('join.decline')}
            </Button>
          </div>
        </div>
      </Sheet>
      {snackbar && <Snackbar message={t('join.accepted')} />}
    </>
  );
}
