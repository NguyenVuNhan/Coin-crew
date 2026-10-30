import type { JSX } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n/en';

export type EntryType = 'expense' | 'income';

export interface EntryTypeSwitchProps {
  value: EntryType;
  onChange(v: EntryType): void;
}

interface EntryOption {
  readonly type: EntryType;
  readonly labelKey: MessageKey;
}

const OPTIONS: readonly EntryOption[] = [
  { type: 'expense', labelKey: 'entry.expense' },
  { type: 'income', labelKey: 'entry.income' },
];

export function EntryTypeSwitch({ value, onChange }: EntryTypeSwitchProps): JSX.Element {
  const t = useT();

  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as EntryType)} className="gap-0">
      <TabsList aria-label={t('entry.tabs')} className={cn('fsl-entry-switch', 'flex bg-muted rounded-full p-1 gap-1 h-auto w-full')}>
        {OPTIONS.map((item) => {
          const selected = value === item.type;
          const label = t(item.labelKey);

          return (
            <TabsTrigger
              key={item.type}
              value={item.type}
              className={cn(
                'fsl-entry-switch__tab flex-1 min-w-0 min-h-11 flex items-center justify-center rounded-full px-3 text-base tabular-nums cursor-pointer select-none transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-muted-foreground hover:text-foreground font-medium',
                'data-active:bg-card data-active:text-foreground data-active:shadow-sm data-active:font-semibold',
                selected && 'fsl-entry-switch__tab--active',
              )}
            >
              {label}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
