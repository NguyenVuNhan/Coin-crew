import { useMemo, type JSX } from 'react';
import { useT, useLang } from '@cc/web-i18n';
import { formatDeleteDate } from '@cc/web-util/time';
import { useScheduleTripDelete } from '@cc/web-data-access/tripDelete';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Button } from '@cc/web-ui/components/Button';
import { InlineError } from '@cc/web-ui/components/InlineError';

export interface DeleteGroupSheetProps {
  open: boolean;
  onClose(): void;
  tripId: string;
  tripName: string;
  hasUnsettled: boolean;
  onScheduled(): void;
}

const GRACE_DAYS_MS = 30 * 86_400_000;

export function DeleteGroupSheet({
  open,
  onClose,
  tripId,
  tripName,
  hasUnsettled,
  onScheduled,
}: DeleteGroupSheetProps): JSX.Element {
  const t = useT();
  const [lang] = useLang();
  const mutation = useScheduleTripDelete(tripId);
  const previewDate = useMemo(
    () => formatDeleteDate(new Date(Date.now() + GRACE_DAYS_MS).toISOString(), lang),
    [open, lang],
  );

  const handleClose = () => {
    if (mutation.isPending) return;
    mutation.reset();
    onClose();
  };

  const handleConfirm = () => {
    mutation.mutate(undefined, {
      onSuccess: () => {
        onClose();
        onScheduled();
      },
    });
  };

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      dismissible={!mutation.isPending}
      title={t('settings.deleteSheetTitle', { group: tripName })}
      className="fsl-delete-sheet"
    >
      <div className="fsl-delete-sheet__body flex flex-col gap-3">
        {mutation.error && <InlineError error={mutation.error} />}

        {hasUnsettled && (
          <div className="fsl-delete-sheet__unsettled rounded-xl bg-danger-soft p-3 text-sm text-danger">
            {t('settings.deleteWarnUnsettled')}
          </div>
        )}

        <div className="fsl-delete-sheet__warnings rounded-xl border border-warning-border bg-warning-soft p-3.5 text-sm text-warning-foreground">
          <ul className="m-0 flex list-disc flex-col gap-1.5 pl-4">
            <li>{t('settings.deleteWarnBook')}</li>
            <li>{t('settings.deleteWarnWait', { date: previewDate })}</li>
            <li>{t('settings.deleteWarnPeople')}</li>
          </ul>
        </div>

        <div className="fsl-delete-sheet__actions mt-1 flex flex-col gap-2">
          <Button variant="danger" block loading={mutation.isPending} onClick={handleConfirm}>
            {t('settings.deleteConfirm')}
          </Button>
          <Button variant="ghost" block disabled={mutation.isPending} onClick={handleClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
