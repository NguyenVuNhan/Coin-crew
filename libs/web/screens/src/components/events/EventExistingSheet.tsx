import { useEffect, useRef, type JSX } from 'react';
import { formatMoney, type EventExisting } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { useApplyEventExisting } from '@cc/web-data-access/events';
import { Button } from '@cc/web-ui/components/Button';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Sheet } from '@cc/web-ui/components/Sheet';

export interface EventExistingSheetProps {
  eventId: string | null;
  existing: EventExisting | null;
  onDone: () => void;
}

export function EventExistingSheet({
  eventId,
  existing,
  onDone,
}: EventExistingSheetProps): JSX.Element {
  const t = useT();
  const applyExisting = useApplyEventExisting();

  const ownIds = existing?.ownIds ?? [];
  const shareRootIds = existing?.shareRootIds ?? [];
  const hasExplicitIds = Boolean(
    existing && (existing.ownIds !== undefined || existing.shareRootIds !== undefined),
  );
  const ownCount = hasExplicitIds ? ownIds.length : (existing?.own.count ?? 0);
  const sharesCount = hasExplicitIds ? shareRootIds.length : (existing?.shares.count ?? 0);
  const totalCount = ownCount + sharesCount;
  const open = Boolean(eventId && existing && totalCount > 0);

  const resetRef = useRef(() => {
    applyExisting.reset();
  });
  resetRef.current = () => {
    applyExisting.reset();
  };

  const submittedRef = useRef(false);
  useEffect(() => {
    if (open) {
      submittedRef.current = false;
      resetRef.current();
    }
  }, [open, eventId]);

  const handleChoice = (tag: boolean) => {
    if (!eventId || applyExisting.isPending || submittedRef.current) return;
    submittedRef.current = true;
    applyExisting.mutate(
      {
        id: eventId,
        tag,
        ...(tag && hasExplicitIds ? { ownIds, shareRootIds } : {}),
      },
      {
        onSuccess: () => {
          onDone();
        },
        onError: () => {
          submittedRef.current = false;
        },
      },
    );
  };

  const ownTotalsText = existing
    ? existing.own.totals.map((item) => formatMoney(item.amount, item.currency)).join(' · ')
    : '';

  return (
    <Sheet
      open={open}
      onClose={() => handleChoice(false)}
      title={t('events.existingTitle')}
    >
      {existing && (
        <div
          className="fsl-event-existing flex flex-col gap-4"
          data-testid="event-existing-sheet"
        >
          <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
            {existing.own.count > 0 && (
              <div className="min-h-11 px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-sm text-foreground">
                  {t('events.existingOwn', { n: existing.own.count })}
                </span>
                <span className="text-sm font-semibold text-foreground tabular-nums shrink-0">
                  {ownTotalsText}
                </span>
              </div>
            )}
            {existing.shares.count > 0 && (
              <div className="min-h-11 px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-sm text-foreground">
                  {t('events.existingShares', { n: existing.shares.count })}
                </span>
                <span className="text-sm font-semibold text-foreground tabular-nums shrink-0">
                  {formatMoney(existing.shares.total, 'VND')}
                </span>
              </div>
            )}
          </div>

          <p className="m-0 text-xs text-muted-foreground">{t('events.existingNote')}</p>

          {applyExisting.error && <InlineError error={applyExisting.error} />}

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="primary"
              block
              loading={applyExisting.isPending}
              data-testid="event-existing-yes"
              onClick={() => handleChoice(true)}
            >
              {t('events.existingYes', { n: totalCount })}
            </Button>
            <Button
              type="button"
              variant="secondary"
              block
              disabled={applyExisting.isPending}
              data-testid="event-existing-no"
              onClick={() => handleChoice(false)}
            >
              {t('events.existingNo')}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
