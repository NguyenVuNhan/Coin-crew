import type { Gender } from '@fsl/core';
import { cn } from '@/lib/utils';
import { useT } from '../i18n';
import { Icon } from './icons';
import { nextGender } from '../lib/recentPeople';

export interface GenderToggleProps {
  name: string;
  value?: Gender | null;
  onChange: (next: Gender | null) => void;
  disabled?: boolean;
  className?: string;
}

export function GenderToggle({
  name,
  value,
  onChange,
  disabled,
  className = '',
}: GenderToggleProps) {
  const t = useT();
  const gender = value ?? null;

  return (
    <button
      type="button"
      className={cn(
        'fsl-gender-toggle',
        `fsl-gender-toggle--${gender ?? 'unset'}`,
        'inline-flex items-center justify-center gap-1 min-h-11 min-w-[68px] px-3 py-1 rounded-full text-sm transition-all motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none select-none shrink-0 cursor-pointer',
        gender
          ? 'bg-card text-foreground font-semibold shadow-sm border border-border'
          : 'bg-muted text-muted-foreground font-medium hover:text-foreground',
        className,
      )}
      aria-label={t('gender.label', { name })}
      disabled={disabled}
      onClick={() => onChange(nextGender(gender))}
    >
      {gender === 'M' && <Icon name="mars" size={14} />}
      {gender === 'F' && <Icon name="venus" size={14} />}
      <span>{gender ? t(`gender.${gender}`) : t('gender.unset')}</span>
    </button>
  );
}
