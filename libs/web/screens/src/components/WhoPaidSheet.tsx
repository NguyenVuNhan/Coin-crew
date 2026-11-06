import { useEffect, useState } from 'react';
import { formatVnd, type ExpensePayView, type PaidBy } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';
import { Input } from '@cc/web-ui/components/ui/input';

export interface WhoPaidSheetProps {
  open: boolean;
  onClose: () => void;
  row: ExpensePayView['row'];
  viewer: PaidBy;
  onReport: (r: { amount: number; paidBy: PaidBy }) => Promise<void>;
}

export function WhoPaidSheet({
  open,
  onClose,
  row,
  viewer,
  onReport,
}: WhoPaidSheetProps) {
  const t = useT();
  const [showOther, setShowOther] = useState(false);
  const [otherValue, setOtherValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setShowOther(false);
      setOtherValue('');
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const handleReport = async (payload: { amount: number; paidBy: PaidBy }) => {
    try {
      setSubmitting(true);
      await onReport(payload);
      onClose();
    } catch {
      // Keep sheet open on report error
    } finally {
      setSubmitting(false);
    }
  };

  const parsedOther = parseInt(otherValue.replace(/\D/g, ''), 10);
  const displayOther = Number.isNaN(parsedOther) ? 0 : parsedOther;

  return (
    <Sheet open={open} onClose={onClose} title={t('whoPaid.title')}>
      <div className="fsl-who-paid flex flex-col gap-3 py-2">
        <Button
          variant="secondary"
          block
          loading={submitting}
          className="fsl-who-paid__whole min-h-11 justify-center"
          onClick={() => handleReport({ amount: row.remaining, paidBy: viewer })}
        >
          {t('whoPaid.wholeRow', { name: row.name, amount: formatVnd(row.remaining) })}
        </Button>

        {(row.tiles ?? []).map((tile, idx) => (
          <Button
            key={`${tile.gender}-${tile.amount}-${idx}`}
            variant="secondary"
            block
            loading={submitting}
            className="fsl-who-paid__slot min-h-11 justify-center flex items-center gap-2"
            onClick={() => handleReport({ amount: tile.amount, paidBy: 'friend' })}
          >
            <Icon
              name={tile.gender === 'F' ? 'venus' : 'mars'}
              size={18}
              className="shrink-0"
            />
            <span>{t('whoPaid.mySlot', { amount: formatVnd(tile.amount) })}</span>
          </Button>
        ))}

        {!showOther ? (
          <Button
            variant="secondary"
            block
            disabled={submitting}
            className="fsl-who-paid__other min-h-11 justify-center"
            onClick={() => setShowOther(true)}
          >
            {t('whoPaid.other')}
          </Button>
        ) : (
          <div className="fsl-who-paid__other-panel flex flex-col gap-3">
            <Input
              type="text"
              inputMode="numeric"
              className="fsl-who-paid__input text-base tabular-nums"
              value={otherValue}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '');
                setOtherValue(digits);
                const num = parseInt(digits, 10);
                if (!Number.isNaN(num) && num > row.remaining) {
                  setError(t('whoPaid.tooMuch', { amount: formatVnd(row.remaining) }));
                } else {
                  setError(null);
                }
              }}
              placeholder="0"
              autoFocus
            />
            {error && (
              <p role="alert" className="fsl-who-paid__error text-sm text-danger m-0">
                {error}
              </p>
            )}
            <Button
              variant="primary"
              block
              loading={submitting}
              className="fsl-who-paid__other-confirm min-h-11 justify-center"
              onClick={() => {
                const num = parseInt(otherValue.replace(/\D/g, ''), 10);
                if (Number.isNaN(num) || num < 1 || num > row.remaining) {
                  setError(t('whoPaid.tooMuch', { amount: formatVnd(row.remaining) }));
                  return;
                }
                handleReport({ amount: num, paidBy: viewer });
              }}
            >
              {t('whoPaid.otherConfirm', {
                amount: formatVnd(displayOther),
              })}
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
