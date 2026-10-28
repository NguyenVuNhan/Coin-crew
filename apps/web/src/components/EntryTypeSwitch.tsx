import { useRef, type JSX, type KeyboardEvent } from 'react';
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
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLButtonElement>) => {
    let targetIndex: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      targetIndex = (index + 1) % OPTIONS.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      targetIndex = (index - 1 + OPTIONS.length) % OPTIONS.length;
    }

    if (targetIndex !== null) {
      event.preventDefault();
      const targetOption = OPTIONS[targetIndex];
      if (targetOption) {
        onChange(targetOption.type);
      }
      buttonRefs.current[targetIndex]?.focus();
    }
  };

  return (
    <div role="tablist" aria-label={t('entry.tabs')} className="fsl-entry-switch flex bg-muted rounded-full p-1 gap-1">
      {OPTIONS.map((item, index) => {
        const selected = value === item.type;
        const label = t(item.labelKey);

        return (
          <button
            key={item.type}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={cn(
              'fsl-entry-switch__tab flex-1 min-w-0 min-h-11 flex items-center justify-center rounded-full px-3 text-base tabular-nums cursor-pointer select-none transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'fsl-entry-switch__tab--active bg-card text-foreground font-semibold shadow-sm'
                : 'text-muted-foreground hover:text-foreground font-medium',
            )}
            onClick={() => onChange(item.type)}
            onKeyDown={(e) => handleKeyDown(index, e)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
