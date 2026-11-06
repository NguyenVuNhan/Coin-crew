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
              type="button"
              role="radio"
              aria-checked={value === null}
              data-theme-option="none"
              disabled={busy}
              onClick={() => onChange(null)}
              className={cn(
                'fsl-theme-picker__option flex flex-col justify-between gap-2 min-h-11 p-3 rounded-xl border border-border bg-card text-left cursor-pointer transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
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

          {THEME_IDS.map((id) => {
            const isSelected = value === id;
            const name = t(`theme.name.${id}`);
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                data-theme-option={id}
                disabled={busy}
                onClick={() => onChange(id)}
                className={cn(
                  'fsl-theme-picker__option flex flex-col justify-between gap-2 min-h-11 p-3 rounded-xl border border-border bg-card text-left cursor-pointer transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
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
