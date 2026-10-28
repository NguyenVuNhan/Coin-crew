import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface BottomBarProps {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}

export function BottomBar({ children, className, wide }: BottomBarProps) {
  return (
    <div
      className={cn(
        'fsl-bottom-bar',
        'fixed inset-x-0 bottom-0 z-15 bg-card border-t border-border flex items-center min-h-[72px] px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]',
        'lg:static lg:z-auto lg:min-h-0 lg:bg-transparent lg:border-t lg:border-border lg:p-4',
        '[&_[aria-current]]:text-primary [&_[data-active=true]]:text-primary',
        className,
      )}
    >
      <div
        className={cn(
          'fsl-bottom-bar__inner',
          'flex flex-col gap-2 w-full mx-auto',
          wide ? 'max-w-[448px] lg:max-w-[1008px]' : 'max-w-[448px] lg:[.fsl-screen--wide_&]:max-w-[1008px]',
        )}
      >
        {children}
      </div>
    </div>
  );
}
