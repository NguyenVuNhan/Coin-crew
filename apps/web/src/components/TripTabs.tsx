import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useT } from '../i18n';

export interface TripTabsProps {
  activeTab: 'expenses' | 'payments';
  onChange: (tab: 'expenses' | 'payments') => void;
}

export function TripTabs({ activeTab, onChange }: TripTabsProps) {
  const t = useT();

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => onChange(v as 'expenses' | 'payments')}
      className="gap-0"
    >
      <TabsList
        aria-label={t('trip.tabs')}
        className={cn('fsl-trip-tabs', 'flex w-full items-center bg-muted rounded-full p-1 gap-1 mt-4 mb-3 h-auto w-full')}
      >
        <TabsTrigger
          value="expenses"
          className={cn(
            'fsl-trip-tab',
            'flex-1 min-h-9 px-3 py-1 rounded-full text-sm font-medium text-muted-foreground text-center cursor-pointer transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'data-active:bg-card data-active:text-foreground data-active:shadow-sm data-active:font-semibold',
            activeTab === 'expenses' && 'fsl-trip-tab--active',
          )}
        >
          {t('trip.tabExpenses')}
        </TabsTrigger>
        <TabsTrigger
          value="payments"
          className={cn(
            'fsl-trip-tab',
            'flex-1 min-h-9 px-3 py-1 rounded-full text-sm font-medium text-muted-foreground text-center cursor-pointer transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'data-active:bg-card data-active:text-foreground data-active:shadow-sm data-active:font-semibold',
            activeTab === 'payments' && 'fsl-trip-tab--active',
          )}
        >
          {t('trip.tabPayments')}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
