import type { CSSProperties } from 'react';
import { formatVnd } from '@fsl/core';
import { cn } from '@/lib/utils';

export interface AmountProps {
  value: number;
  tone?: 'auto' | 'neutral' | 'success' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  style?: CSSProperties;
}

const TONE_CLASSES: Record<'neutral' | 'success' | 'danger', string> = {
  neutral: 'text-foreground',
  success: 'text-success',
  danger: 'text-danger',
};

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg' | 'xl', string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-2xl font-bold',
};

export function Amount({
  value,
  tone = 'neutral',
  size = 'md',
  className = '',
  style,
}: AmountProps) {
  let resolvedTone: 'neutral' | 'success' | 'danger' = 'neutral';
  if (tone === 'auto') {
    if (value > 0) {
      resolvedTone = 'success';
    } else if (value < 0) {
      resolvedTone = 'danger';
    } else {
      resolvedTone = 'neutral';
    }
  } else {
    resolvedTone = tone;
  }

  return (
    <span
      className={cn(
        'fsl-amount',
        `fsl-amount--${resolvedTone}`,
        `fsl-amount--${size}`,
        'inline-block whitespace-nowrap tabular-nums font-semibold',
        TONE_CLASSES[resolvedTone],
        SIZE_CLASSES[size],
        className,
      )}
      style={style}
    >
      {formatVnd(value)}
    </span>
  );
}
