import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TripLayoutProps {
  left: ReactNode;
  right: ReactNode;
  className?: string;
}

/** Layout A: the trip's lists on the left, a sticky panel on the right (from 1024px). */
export function TripLayout({ left, right, className }: TripLayoutProps) {
  return (
    <div
      className={cn(
        'fsl-trip-layout',
        'flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start',
        className,
      )}
    >
      <div className={cn('fsl-trip-layout__main', 'flex flex-col gap-4 min-w-0')}>{left}</div>
      <div
        className={cn(
          'fsl-trip-layout__side',
          'flex flex-col gap-4 min-w-0 lg:sticky lg:top-[72px] lg:max-h-[calc(100dvh-88px)] lg:overflow-y-auto lg:overscroll-contain lg:p-1 lg:-m-1',
        )}
      >
        {right}
      </div>
    </div>
  );
}
