import { useT } from '../i18n';
import { cn } from '@/lib/utils';

export interface TripTabsProps {
  activeTab: 'expenses' | 'payments';
  onChange: (tab: 'expenses' | 'payments') => void;
}

export function TripTabs({ activeTab, onChange }: TripTabsProps) {
  const t = useT();

  return (
    <div
      className={cn('fsl-trip-tabs', 'flex w-full items-center bg-muted rounded-full p-1 gap-1 mt-4 mb-3')}
      role="tablist"
      aria-label={t('trip.tabs')}
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'expenses'}
        className={cn(
          'fsl-trip-tab',
          'flex-1 min-h-9 px-3 py-1 rounded-full text-sm font-medium text-muted-foreground text-center cursor-pointer transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          activeTab === 'expenses' && 'fsl-trip-tab--active bg-card text-foreground shadow-sm font-semibold',
        )}
        onClick={() => onChange('expenses')}
      >
        {t('trip.tabExpenses')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'payments'}
        className={cn(
          'fsl-trip-tab',
          'flex-1 min-h-9 px-3 py-1 rounded-full text-sm font-medium text-muted-foreground text-center cursor-pointer transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          activeTab === 'payments' && 'fsl-trip-tab--active bg-card text-foreground shadow-sm font-semibold',
        )}
        onClick={() => onChange('payments')}
      >
        {t('trip.tabPayments')}
      </button>
    </div>
  );
}
