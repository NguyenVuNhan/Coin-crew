import { useEffect, useRef, type JSX } from 'react';
import { formatMoney, type TravelExisting } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { useApplyTravelExisting } from '@cc/web-data-access/travels';
import { Button } from '@cc/web-ui/components/Button';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Sheet } from '@cc/web-ui/components/Sheet';

export interface TravelExistingSheetProps {
  travelId: string | null;
  existing: TravelExisting | null;
  onDone: () => void;
}

export function TravelExistingSheet({
  travelId,
  existing,
  onDone,
}: TravelExistingSheetProps): JSX.Element {
  const t = useT();
  const applyExisting = useApplyTravelExisting();

  const ownIds = existing?.ownIds ?? [];
  const shareRootIds = existing?.shareRootIds ?? [];
  const hasExplicitIds = Boolean(
    existing && (existing.ownIds !== undefined || existing.shareRootIds !== undefined),
  );
  const ownCount = hasExplicitIds ? ownIds.length : (existing?.own.count ?? 0);
  const sharesCount = hasExplicitIds ? shareRootIds.length : (existing?.shares.count ?? 0);
  const totalCount = ownCount + sharesCount;
  const open = Boolean(travelId && existing && totalCount > 0);

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
  }, [open, travelId]);

  const handleChoice = (tag: boolean) => {
    if (!travelId || applyExisting.isPending || submittedRef.current) return;
    submittedRef.current = true;
    applyExisting.mutate(
      {
        id: travelId,
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
      title={t('travels.existingTitle')}
    >
      {existing && (
        <div
          className="fsl-travel-existing flex flex-col gap-4"
          data-testid="travel-existing-sheet"
        >
          <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
            {existing.own.count > 0 && (
              <div className="min-h-11 px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-sm text-foreground">
                  {t('travels.existingOwn', { n: existing.own.count })}
                </span>
                <span className="text-sm font-semibold text-foreground tabular-nums shrink-0">
                  {ownTotalsText}
                </span>
              </div>
            )}
            {existing.shares.count > 0 && (
              <div className="min-h-11 px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-sm text-foreground">
                  {t('travels.existingShares', { n: existing.shares.count })}
                </span>
                <span className="text-sm font-semibold text-foreground tabular-nums shrink-0">
                  {formatMoney(existing.shares.total, 'VND')}
                </span>
              </div>
            )}
          </div>

          <p className="m-0 text-xs text-muted-foreground">{t('travels.existingNote')}</p>

          {applyExisting.error && <InlineError error={applyExisting.error} />}

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="primary"
              block
              loading={applyExisting.isPending}
              data-testid="travel-existing-yes"
              onClick={() => handleChoice(true)}
            >
              {t('travels.existingYes', { n: totalCount })}
            </Button>
            <Button
              type="button"
              variant="secondary"
              block
              disabled={applyExisting.isPending}
              data-testid="travel-existing-no"
              onClick={() => handleChoice(false)}
            >
              {t('travels.existingNo')}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
