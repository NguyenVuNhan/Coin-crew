import type { CSSProperties } from 'react';
import { formatVnd } from '@fsl/core';
import './Amount.css';

export interface AmountProps {
  value: number;
  tone?: 'auto' | 'neutral' | 'success' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  style?: CSSProperties;
}

export function Amount({
  value,
  tone = 'neutral',
  size = 'md',
  className = '',
  style,
}: AmountProps) {
  let resolvedTone = tone;
  if (tone === 'auto') {
    if (value > 0) {
      resolvedTone = 'success';
    } else if (value < 0) {
      resolvedTone = 'danger';
    } else {
      resolvedTone = 'neutral';
    }
  }

  return (
    <span
      className={`fsl-amount fsl-amount--${resolvedTone} fsl-amount--${size} ${className}`.trim()}
      style={style}
    >
      {formatVnd(value)}
    </span>
  );
}
