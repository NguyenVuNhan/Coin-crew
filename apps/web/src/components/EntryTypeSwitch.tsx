import { useRef, type JSX, type KeyboardEvent } from 'react';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n/en';
import './EntryTypeSwitch.css';

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
    <div role="tablist" aria-label={t('entry.tabs')} className="fsl-entry-switch">
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
            className={`fsl-entry-switch__tab${selected ? ' fsl-entry-switch__tab--active' : ''}`}
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
