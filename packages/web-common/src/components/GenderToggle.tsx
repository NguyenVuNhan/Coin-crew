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
  variant?: 'default' | 'inline';
}

export function GenderToggle({
  name,
  value,
  onChange,
  disabled,
  className = '',
  variant = 'default',
}: GenderToggleProps) {
  const t = useT();
  const gender = value ?? null;

  const title =
    gender === 'M'
      ? t('gender.M')
      : gender === 'F'
        ? t('gender.F')
        : t('gender.unset');

  return (
    <button
      type="button"
      className={cn(
        'fsl-gender-toggle',
        `fsl-gender-toggle--${gender ?? 'unset'}`,
        'inline-flex items-center justify-center rounded-full transition-all motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none select-none shrink-0 cursor-pointer p-0',
        variant === 'inline'
          ? cn(
              'size-9 bg-transparent border-0 shadow-none hover:bg-muted',
              gender ? 'text-foreground' : 'text-muted-foreground',
            )
          : cn(
              'size-11',
              gender
                ? 'bg-card border border-border shadow-sm text-foreground'
                : 'bg-muted text-muted-foreground',
            ),
        className,
      )}
      aria-label={t('gender.label', { name })}
      title={title}
      disabled={disabled}
      onClick={() => onChange(nextGender(gender))}
    >
      {gender === 'M' && <Icon name="mars" size={18} />}
      {gender === 'F' && <Icon name="venus" size={18} />}
      {!gender && <Icon name="user" size={18} />}
    </button>
  );
}
