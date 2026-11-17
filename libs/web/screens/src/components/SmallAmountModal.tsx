import type { JSX } from 'react';
import { formatMoney } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Button } from '@cc/web-ui/components/Button';
import { Modal } from '@cc/web-ui/components/Modal';

export interface SmallAmountModalProps {
  minor: number | null;
  onClose(): void;
  onKeep(minor: number): void;
  onMultiply(multipliedMinor: number): void;
  disabled?: boolean;
}

/** Confirms VND 1–999 amounts before saving so "85" doesn't silently save as 85₫. */
export function SmallAmountModal({
  minor,
  onClose,
  onKeep,
  onMultiply,
  disabled = false,
}: SmallAmountModalProps): JSX.Element {
  const t = useT();

  return (
    <Modal
      open={minor !== null}
      onClose={onClose}
      title={t('personalEntry.smallAmountTitle')}
    >
      {minor !== null && (
        <div className="flex flex-col gap-4">
          <p className="m-0 text-sm text-muted-foreground tabular-nums">
            {t('personalEntry.smallAmountBody', {
              amount: formatMoney(minor, 'VND'),
            })}
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              data-testid="small-amount-keep"
              disabled={disabled}
              onClick={() => onKeep(minor)}
            >
              {t('personalEntry.smallAmountKeep', {
                amount: formatMoney(minor, 'VND'),
              })}
            </Button>
            <Button
              type="button"
              variant="primary"
              data-testid="small-amount-multiply"
              disabled={disabled}
              onClick={() => onMultiply(minor * 1000)}
            >
              {t('personalEntry.smallAmountMultiply', {
                amount: formatMoney(minor * 1000, 'VND'),
              })}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
