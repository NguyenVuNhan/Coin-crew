import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  radius?: string | number | 'sm' | 'md' | 'lg' | 'xl' | 'pill';
  className?: string;
  style?: CSSProperties;
}

const NAMED_RADII: Record<string, string> = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  pill: 'rounded-full',
};

export function Skeleton({
  width = '100%',
  height = '1rem',
  radius = 'sm',
  className = '',
  style,
}: SkeletonProps) {
  let radiusClass: string | undefined;
  let borderRadius: string | undefined;

  if (typeof radius === 'string' && radius in NAMED_RADII) {
    radiusClass = NAMED_RADII[radius];
  } else if (typeof radius === 'number') {
    borderRadius = `${radius}px`;
  } else {
    borderRadius = radius;
  }

  const computedStyle: CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    ...(borderRadius !== undefined ? { borderRadius } : {}),
    ...style,
  };

  return (
    <div
      className={cn('fsl-skeleton', 'animate-pulse bg-muted', radiusClass, className)}
      style={computedStyle}
      aria-hidden="true"
    />
  );
}

export interface SkeletonListProps {
  rows?: number;
  className?: string;
}

export function SkeletonList({ rows = 3, className = '' }: SkeletonListProps) {
  return (
    <div
      className={cn('fsl-skeleton-list flex w-full flex-col gap-3', className)}
      aria-busy="true"
      aria-live="polite"
    >
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="fsl-skeleton-list__row flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-xl"
        >
          <Skeleton width={40} height={40} radius="pill" />
          <div className="fsl-skeleton-list__text flex flex-1 min-w-0 flex-col gap-1">
            <Skeleton width="60%" height={16} radius="sm" />
            <Skeleton width="40%" height={12} radius="sm" />
          </div>
          <Skeleton width={72} height={18} radius="sm" />
        </div>
      ))}
    </div>
  );
}
