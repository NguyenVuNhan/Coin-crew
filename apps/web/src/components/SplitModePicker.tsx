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

export interface SplitModePickerProps {
  value: SplitMode;
  onChange(mode: SplitMode): void;
  showSport?: boolean;
  sportSelected?: boolean;
  onSelectSport?: () => void;
}

export function SplitModePicker({
  value,
  onChange,
  showSport = false,
  sportSelected = false,
  onSelectSport,
}: SplitModePickerProps): JSX.Element {
  const t = useT();
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const totalButtons = showSport ? 1 + MODES.length : MODES.length;

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLButtonElement>) => {
    let targetIndex: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      targetIndex = (index + 1) % totalButtons;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      targetIndex = (index - 1 + totalButtons) % totalButtons;
    }

    if (targetIndex !== null) {
      event.preventDefault();
      if (showSport && targetIndex === 0) {
        onSelectSport?.();
      } else {
        const modeIdx = showSport ? targetIndex - 1 : targetIndex;
        const targetOption = MODES[modeIdx];
        if (targetOption) {
          onChange(targetOption.mode);
        }
      }
      buttonRefs.current[targetIndex]?.focus();
    }
  };

  return (
    <div role="radiogroup" aria-label={t('expenseForm.split')} className="fsl-split-picker">
      {showSport && (
        <button
          key="sport"
          ref={(el) => {
            buttonRefs.current[0] = el;
          }}
          type="button"
          role="radio"
          className={`fsl-split-picker__option${sportSelected ? ' fsl-split-picker__option--active' : ''}`}
          aria-checked={Boolean(sportSelected)}
          aria-label={t('split.tab.sport')}
          title={t('split.tab.sport')}
          tabIndex={sportSelected ? 0 : -1}
          onClick={() => onSelectSport?.()}
          onKeyDown={(e) => handleKeyDown(0, e)}
        >
          <span aria-hidden="true">
            <Icon name="trophy" size={20} />
          </span>
        </button>
      )}
      {MODES.map((item, index) => {
        const refIndex = showSport ? index + 1 : index;
        const selected = !sportSelected && value === item.mode;
        const label = t(item.labelKey);

        return (
          <button
            key={item.mode}
            ref={(el) => {
              buttonRefs.current[refIndex] = el;
            }}
            type="button"
            role="radio"
            className={`fsl-split-picker__option${selected ? ' fsl-split-picker__option--active' : ''}`}
            aria-checked={selected}
            aria-label={label}
            title={label}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.mode)}
            onKeyDown={(e) => handleKeyDown(refIndex, e)}
          >
            <span aria-hidden="true">{item.content}</span>
          </button>
        );
      })}
    </div>
  );
}
