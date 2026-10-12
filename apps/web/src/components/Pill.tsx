import type { ReactNode } from 'react';
import './Pill.css';

export interface PillProps {
  tone?: 'neutral' | 'accent' | 'success' | 'danger' | 'warning';
  className?: string;
  children: ReactNode;
}

export function Pill({ tone = 'neutral', className = '', children }: PillProps) {
  return (
    <span className={`fsl-pill fsl-pill--${tone} ${className}`.trim()}>
      {children}
    </span>
  );
}
