import type { JSX, ReactNode } from 'react';
import { useT } from '@cc/web-i18n';
import { Icon } from '@cc/web-ui/components/icons';
import { EntryDateRow } from '../EntryDateRow';

export interface SharedDetailsCardProps {
  payerName?: string;
  onOpenPayer?(): void;
  /** Replaces the tap-to-open payer row, e.g. the group form's labelled select. */
  payerControl?: ReactNode;
  date: string;
  onDateChange(d: string): void;
  walletRow?: ReactNode;
}

export function SharedDetailsCard({
  payerName,
  onOpenPayer,
  payerControl,
  date,
  onDateChange,
  walletRow,
}: SharedDetailsCardProps): JSX.Element {
  const t = useT();

  return (
    <div
      data-testid="shared-details-card"
      className="rounded-xl bg-card divide-y divide-border overflow-hidden"
    >
      {payerControl ?? (
      <button
        type="button"
        data-testid="shared-payer-row"
        onClick={onOpenPayer}
        className="w-full min-h-11 px-4 py-3 flex items-center justify-between gap-3 bg-transparent border-0 text-left cursor-pointer hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <span className="text-sm font-medium text-muted-foreground shrink-0">
          {t('sharedExpense.payer')}
        </span>
        <span className="flex items-center gap-1 min-w-0 text-base font-medium text-foreground">
          <span className="truncate">{payerName}</span>
          <Icon name="chevronRight" size={18} className="text-muted-foreground shrink-0" />
        </span>
      </button>
      )}
      <EntryDateRow
        date={date}
        time={null}
        onChange={(next) => onDateChange(next.date)}
        showTime={false}
      />
      {walletRow}
    </div>
  );
}
