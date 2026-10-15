import { useRef, type JSX, type KeyboardEvent, type ReactNode } from 'react';
import type { SplitMode } from '@fsl/core';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n/en';
import { Icon } from './icons';
import './SplitModePicker.css';

interface SplitModeOption {
  readonly mode: SplitMode;
  readonly labelKey: MessageKey;
  readonly content: ReactNode;
}

const MODES: readonly SplitModeOption[] = [
  { mode: 'equal', labelKey: 'split.mode.equal', content: '=' },
  { mode: 'amounts', labelKey: 'split.mode.exact', content: '1.23' },
  { mode: 'percent', labelKey: 'split.mode.percent', content: '%' },
  { mode: 'shares', labelKey: 'split.mode.shares', content: <Icon name="pie" size={20} /> },
  { mode: 'adjust', labelKey: 'split.mode.adjust', content: '+/\u2212' },
];

export function SplitModePicker({
  value,
  onChange,
}: {
  value: SplitMode;
  onChange(mode: SplitMode): void;
}): JSX.Element {
  const t = useT();
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLButtonElement>) => {
    let targetIndex: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      targetIndex = (index + 1) % MODES.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      targetIndex = (index - 1 + MODES.length) % MODES.length;
    }

    if (targetIndex !== null) {
      const targetOption = MODES[targetIndex];
      if (targetOption) {
        event.preventDefault();
        onChange(targetOption.mode);
        buttonRefs.current[targetIndex]?.focus();
      }
    }
  };

  return (
    <div role="radiogroup" aria-label={t('expenseForm.split')} className="fsl-split-picker">
      {MODES.map((item, index) => {
        const selected = value === item.mode;
        const label = t(item.labelKey);

        return (
          <button
            key={item.mode}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            className={`fsl-split-picker__option${selected ? ' fsl-split-picker__option--active' : ''}`}
            aria-checked={selected}
            aria-label={label}
            title={label}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.mode)}
            onKeyDown={(e) => handleKeyDown(index, e)}
          >
            <span aria-hidden="true">{item.content}</span>
          </button>
        );
      })}
    </div>
  );
}
