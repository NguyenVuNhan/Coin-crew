import { useEffect, useRef, type ReactNode } from 'react';
import { useKeyboardInset } from '@cc/web-util/useKeyboardInset';
import { cn } from '../lib/utils';

export interface BottomBarProps {
  children: ReactNode;
  className?: string;
  wide?: boolean;
  keyboardAware?: boolean;
  /** Told the bar's rendered height whenever it changes, so the page can keep exactly that much room under it. */
  onHeight?: (px: number) => void;
}

export function BottomBar({ children, className, wide, keyboardAware, onHeight }: BottomBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !onHeight || typeof ResizeObserver === 'undefined') return;
    const report = () => onHeight(Math.ceil(el.getBoundingClientRect().height));
    const ro = new ResizeObserver(report);
    ro.observe(el);
    report();
    return () => ro.disconnect();
  }, [onHeight]);
  const isDesktop =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 1024px)').matches
      : false;
  const inset = useKeyboardInset(Boolean(keyboardAware && !isDesktop));

  return (
    <div
      ref={ref}
      className={cn(
        'fsl-bottom-bar',
        'fixed inset-x-0 bottom-0 z-15 bg-card border-t border-border flex items-center min-h-[72px] px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]',
        // Wide screens: sticky in the page's flow, so it stays in view on a long page yet never covers its last lines.
        'lg:sticky lg:min-h-0 lg:bg-background lg:border-t lg:border-border lg:p-4',
        '[&_[aria-current]]:text-primary [&_[data-active=true]]:text-primary',
        className,
      )}
      style={{ transform: inset ? `translateY(-${inset}px)` : undefined }}
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
