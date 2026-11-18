import { flushSync } from 'react-dom';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Runs a fold state update inside `document.startViewTransition` (flushing React state
 * synchronously so the new snapshot sees the folded/unfolded DOM), unless View Transitions
 * are unavailable or reduced motion is preferred.
 */
export function runFoldTransition(update: () => void): void {
  if (
    typeof document !== 'undefined' &&
    typeof document.startViewTransition === 'function' &&
    !prefersReducedMotion()
  ) {
    document.startViewTransition(() => {
      flushSync(update);
    });
    return;
  }
  update();
}
