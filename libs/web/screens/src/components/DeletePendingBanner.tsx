import type { JSX } from 'react';
import { useT, useLang } from '@cc/web-i18n';
import { deleteDaysLeft, formatDeleteDate } from '@cc/web-util/time';
import { useCancelTripDelete } from '@cc/web-data-access/tripDelete';
import { Button } from '@cc/web-ui/components/Button';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Icon } from '@cc/web-ui/components/icons';

export interface DeletePendingBannerProps {
  tripId: string;
  deleteAfter: string;
  canCancel: boolean;
  showSpendingBookNote: boolean;
  onCancelled?: () => void;
}

export function DeletePendingBanner({
  tripId,
  deleteAfter,
  canCancel,
  showSpendingBookNote,
  onCancelled,
}: DeletePendingBannerProps): JSX.Element {
  const t = useT();
  const [lang] = useLang();
  const mutation = useCancelTripDelete(tripId);

  const days = deleteDaysLeft(deleteAfter);
  const date = formatDeleteDate(deleteAfter, lang);
  const headline =
    days <= 0
      ? t('trip.deleteBannerHeadlineToday')
      : days === 1
        ? t('trip.deleteBannerHeadlineOneDay', { date })
        : t('trip.deleteBannerHeadline', { days, date });

  const handleCancel = () => {
    mutation.mutate(undefined, {
      onSuccess: () => onCancelled?.(),
    });
  };

  return (
    <div className="fsl-delete-banner flex flex-col gap-2.5 rounded-xl bg-danger-soft px-4 py-3">
      <div className="fsl-delete-banner__row flex items-start gap-2.5">
        <Icon name="clock" size={18} className="mt-0.5 shrink-0 text-danger" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="m-0 text-sm font-semibold text-danger">{headline}</p>
          {showSpendingBookNote && (
            <p className="m-0 text-sm text-foreground">{t('trip.deleteBannerBookNote')}</p>
          )}
        </div>
      </div>

      {canCancel && (
        <>
          {mutation.error && <InlineError error={mutation.error} />}
          <Button
            variant="secondary"
            loading={mutation.isPending}
            className="fsl-delete-banner__cancel min-h-11 self-start border border-danger bg-card text-danger transition-colors duration-150 ease-out hover:border-danger hover:bg-danger-soft hover:text-danger motion-reduce:transition-none"
            onClick={handleCancel}
          >
            {t('settings.cancelDeleteShort')}
          </Button>
        </>
      )}
    </div>
  );
}
