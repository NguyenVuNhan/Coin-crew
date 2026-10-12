import type { CSSProperties } from 'react';
import './Skeleton.css';

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  radius?: string | number | 'sm' | 'md' | 'lg' | 'xl' | 'pill';
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({
  width = '100%',
  height = '1rem',
  radius = 'sm',
  className = '',
  style,
}: SkeletonProps) {
  let borderRadius: string;
  if (
    radius === 'sm' ||
    radius === 'md' ||
    radius === 'lg' ||
    radius === 'xl' ||
    radius === 'pill'
  ) {
    borderRadius = `var(--radius-${radius})`;
  } else if (typeof radius === 'number') {
    borderRadius = `${radius}px`;
  } else {
    borderRadius = radius;
  }

  const computedStyle: CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    borderRadius,
    ...style,
  };

  return (
    <div
      className={`fsl-skeleton ${className}`.trim()}
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
      className={`fsl-skeleton-list ${className}`.trim()}
      aria-busy="true"
      aria-live="polite"
    >
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="fsl-skeleton-list__row">
          <Skeleton width={40} height={40} radius="pill" />
          <div className="fsl-skeleton-list__text">
            <Skeleton width="60%" height={16} radius="sm" />
            <Skeleton width="40%" height={12} radius="sm" />
          </div>
          <Skeleton width={72} height={18} radius="sm" />
        </div>
      ))}
    </div>
  );
}
