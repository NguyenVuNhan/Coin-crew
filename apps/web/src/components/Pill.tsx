import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface PillProps {
  tone?: 'neutral' | 'accent' | 'success' | 'danger' | 'warning';
  className?: string;
  children: ReactNode;
}

const TONE = {
  neutral: 'bg-muted text-muted-foreground',
  accent: 'bg-secondary text-secondary-foreground',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning-foreground',
};

export function Pill({ tone = 'neutral', className, children }: PillProps) {
  return (
    <Badge
      className={cn(
        'fsl-pill',
        `fsl-pill--${tone}`,
        'rounded-full border-transparent font-semibold',
        TONE[tone],
        className,
      )}
    >
      {children}
    </Badge>
  );
}
