import { useCallback, useRef, useState, type ReactNode } from 'react';
import type { TripView } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Button } from '@cc/web-ui/components/Button';
import { useTrip } from '../lib/tripBase';
import { bankDetailsHref, bankFirstSkipped, needsBankFirst, skipBankFirst } from '../lib/bankFirst';

export interface BankFirstSheetProps {
  view: TripView;
  open: boolean;
  onClose: () => void;
  onAnyway: () => void;
}

export function BankFirstSheet({ view, open, onClose, onAnyway }: BankFirstSheetProps) {
  const t = useT();
  const { href } = useTrip(view.trip.id);

  return (
    <Sheet open={open} onClose={onClose} title={t('bankFirst.title')}>
      <div className="fsl-bank-first flex flex-col gap-4">
        <p className="m-0 text-base text-muted-foreground">{t('bankFirst.body')}</p>
        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            block
            href={bankDetailsHref(view, href)}
            onClick={onClose}
            className="fsl-bank-first__add"
          >
            {t('bankFirst.add')}
          </Button>
          <Button
            variant="secondary"
            block
            onClick={onAnyway}
            className="fsl-bank-first__anyway"
          >
            {t('bankFirst.anyway')}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

export function useBankFirst(view: TripView): {
  guard: (action: () => void | Promise<void>) => void;
  sheet: ReactNode;
} {
  const [open, setOpen] = useState(false);
  const pendingActionRef = useRef<(() => void | Promise<void>) | null>(null);

  const guard = useCallback(
    (action: () => void | Promise<void>) => {
      if (!needsBankFirst(view) || bankFirstSkipped(view.trip.id)) {
        void action();
        return;
      }
      pendingActionRef.current = action;
      setOpen(true);
    },
    [view],
  );

  const handleClose = useCallback(() => {
    setOpen(false);
    pendingActionRef.current = null;
  }, []);

  const handleAnyway = useCallback(() => {
    skipBankFirst(view.trip.id);
    setOpen(false);
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    void action?.();
  }, [view.trip.id]);

  const sheet = (
    <BankFirstSheet
      view={view}
      open={open}
      onClose={handleClose}
      onAnyway={handleAnyway}
    />
  );

  return { guard, sheet };
}
