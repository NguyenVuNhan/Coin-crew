import { useRef, type KeyboardEvent } from 'react';
import { THEME_IDS, type ThemeId } from '@cc/core';
import type { ApiClientError } from '@cc/web-data-access/client';
import { useT } from '@cc/web-i18n';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Icon } from '@cc/web-ui/components/icons';
import { cn } from '@cc/web-ui/lib/utils';

export interface ThemePickerProps {
  open: boolean;
  onClose(): void;
  title: string;
  explain: string;
  value: ThemeId | null;
  onChange(theme: ThemeId | null): void;
  noneLabel?: string;
  busy?: boolean;
  error?: ApiClientError | null;
}

export function ThemePicker({
  open,
  onClose,
  title,
  explain,
  value,
  onChange,
  noneLabel,
  busy = false,
  error = null,
}: ThemePickerProps) {
  const t = useT();
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const options: (ThemeId | null)[] =
    noneLabel !== undefined ? [null, ...THEME_IDS] : [...THEME_IDS];
  const checkedIndex = options.indexOf(value);
  const activeTabIndex = checkedIndex >= 0 ? checkedIndex : 0;

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const count = options.length;
    let nextIndex: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIndex = (index + 1) % count;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIndex = (index - 1 + count) % count;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = count - 1;
    }
    if (nextIndex !== null) {
      e.preventDefault();
      optionRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={title} className="fsl-theme-picker">
      <div className="fsl-theme-picker__body flex flex-col gap-3">
        <p className="fsl-theme-picker__explain m-0 text-sm text-muted-foreground">
          {explain}
        </p>

        <div
          role="radiogroup"
          aria-label={title}
          className="fsl-theme-picker__grid grid grid-cols-2 gap-3"
        >
          {noneLabel !== undefined && (
            <button
              ref={(el) => {
                optionRefs.current[0] = el;
              }}
              type="button"
              role="radio"
              aria-checked={value === null}
              aria-disabled={busy ? 'true' : undefined}
              tabIndex={activeTabIndex === 0 ? 0 : -1}
              data-theme-option="none"
              onClick={() => {
                if (busy) return;
                onChange(null);
              }}
              onKeyDown={(e) => handleKeyDown(e, 0)}
              className={cn(
                'fsl-theme-picker__option flex flex-col justify-between gap-2 min-h-11 p-3 rounded-xl border border-border bg-card text-left cursor-pointer transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                value === null && 'ring-2 ring-primary fsl-theme-picker__option--selected',
              )}
            >
              <div
                aria-hidden="true"
                className="fsl-theme-picker__preview fsl-theme-picker__preview--none flex flex-col gap-2 p-2.5 rounded-lg bg-muted border border-border w-full"
              >
                <div className="fsl-theme-picker__header h-1.5 w-full rounded-full bg-border" />
                <div className="flex items-center gap-1.5">
                  <span className="h-4 w-10 rounded-full bg-border" />
                  <span className="h-4 w-8 rounded-full bg-card" />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 w-full">
                <span className="fsl-theme-picker__name text-sm font-semibold text-foreground">
                  {noneLabel}
                </span>
                {value === null && (
                  <Icon
                    name="check"
                    size={16}
                    className="fsl-theme-picker__check text-primary shrink-0"
                  />
                )}
              </div>
            </button>
          )}

          {THEME_IDS.map((id, i) => {
            const index = noneLabel !== undefined ? i + 1 : i;
            const isSelected = value === id;
            const name = t(`theme.name.${id}`);
            return (
              <button
                key={id}
                ref={(el) => {
                  optionRefs.current[index] = el;
                }}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-disabled={busy ? 'true' : undefined}
                tabIndex={activeTabIndex === index ? 0 : -1}
                data-theme-option={id}
                onClick={() => {
                  if (busy) return;
                  onChange(id);
                }}
                onKeyDown={(e) => handleKeyDown(e, index)}
                className={cn(
                  'fsl-theme-picker__option flex flex-col justify-between gap-2 min-h-11 p-3 rounded-xl border border-border bg-card text-left cursor-pointer transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isSelected && 'ring-2 ring-primary fsl-theme-picker__option--selected',
                )}
              >
                <div
                  data-theme={id}
                  aria-hidden="true"
                  className="fsl-theme-picker__preview flex flex-col gap-2 p-2.5 rounded-lg bg-background border border-border w-full"
                >
                  <div className="fsl-theme-picker__header h-1.5 w-full rounded-full bg-border" />
                  <div className="flex items-center gap-1.5">
                    <span className="fsl-theme-picker__pill h-4 w-10 rounded-full bg-primary" />
                    <span className="fsl-theme-picker__chip h-4 w-8 rounded-full bg-secondary" />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 w-full">
                  <span className="fsl-theme-picker__name text-sm font-semibold text-foreground">
                    {name}
                  </span>
                  {isSelected && (
                    <Icon
                      name="check"
                      size={16}
                      className="fsl-theme-picker__check text-primary shrink-0"
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {error ? <InlineError error={error} className="fsl-theme-picker__error" /> : null}
      </div>
    </Sheet>
  );
}
