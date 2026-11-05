import { useState } from 'react';
import type { Gender } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { cn } from '@cc/web-ui/lib/utils';
import { Icon } from '@cc/web-ui/components/icons';
import { ActionSheet } from '@cc/web-ui/components/ActionSheet';
import type { RowAction } from '@cc/web-ui/components/ActionRow';

export interface GenderPillProps {
  name: string;
  value: Gender | null;
  editable: boolean;
  onChange?: (next: Gender) => void;
  disabled?: boolean;
  className?: string;
}

export function GenderPill({
  name,
  value,
  editable,
  onChange,
  disabled,
  className,
}: GenderPillProps) {
  const t = useT();
  const [open, setOpen] = useState(false);

  if (!editable) {
    if (!value) {
      return null;
    }
    const label = value === 'M' ? t('gender.pillM') : t('gender.pillF');
    return (
      <span
        className={cn(
          'fsl-gender-pill fsl-gender-pill--text',
          `fsl-gender-pill--${value}`,
          'text-sm text-muted-foreground inline-flex items-center gap-1',
          className,
        )}
      >
        <Icon name={value === 'M' ? 'mars' : 'venus'} size={14} />
        <span>{label}</span>
      </span>
    );
  }

  if (value) {
    const label = value === 'M' ? t('gender.pillM') : t('gender.pillF');
    return (
      <button
        type="button"
        disabled={disabled}
        aria-label={t('gender.pillLabel', { name, gender: label })}
        className={cn(
          'fsl-gender-pill',
          `fsl-gender-pill--${value}`,
          'h-7 px-2.5 rounded-full bg-muted text-foreground text-sm font-semibold inline-flex items-center gap-1 relative after:absolute after:-inset-x-1 after:-inset-y-2 after:content-[\'\'] focus-visible:outline-none focus-visible:ring-2 ring-ring cursor-pointer select-none border-0 disabled:opacity-50 disabled:pointer-events-none',
          className,
        )}
        onClick={() => onChange?.(value === 'M' ? 'F' : 'M')}
      >
        <Icon name={value === 'M' ? 'mars' : 'venus'} size={14} />
        <span>{label}</span>
      </button>
    );
  }

  const actions: RowAction[] = [
    {
      id: 'gender-m',
      label: t('gender.pillM'),
      icon: 'mars',
      onSelect: () => onChange?.('M'),
    },
    {
      id: 'gender-f',
      label: t('gender.pillF'),
      icon: 'venus',
      onSelect: () => onChange?.('F'),
    },
  ];

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-label={t('gender.setFor', { name })}
        className={cn(
          'fsl-gender-pill fsl-gender-pill--unset',
          'h-7 px-2.5 rounded-full bg-muted text-foreground text-sm font-semibold inline-flex items-center gap-1 relative after:absolute after:-inset-x-1 after:-inset-y-2 after:content-[\'\'] focus-visible:outline-none focus-visible:ring-2 ring-ring cursor-pointer select-none border-0 disabled:opacity-50 disabled:pointer-events-none',
          className,
        )}
        onClick={() => setOpen(true)}
      >
        {t('gender.set')}
      </button>
      <ActionSheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('gender.label', { name })}
        actions={actions}
      />
    </>
  );
}
