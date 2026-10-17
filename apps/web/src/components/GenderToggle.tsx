import type { Gender } from '@fsl/core';
import { useT } from '../i18n';
import { Icon } from './icons';
import { nextGender } from '../lib/recentPeople';
import './GenderToggle.css';

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
      className={`fsl-gender-toggle fsl-gender-toggle--${gender ?? 'unset'} ${className}`.trim()}
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
