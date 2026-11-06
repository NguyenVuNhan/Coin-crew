import { useEffect, useState } from 'react';

function getKeyboardInset(): number {
  if (typeof window === 'undefined' || !window.visualViewport) {
    return 0;
  }
  const vv = window.visualViewport;
  const offsetTop = vv.offsetTop ?? 0;
  return Math.max(0, Math.round(window.innerHeight - vv.height - offsetTop));
}

/**
 * Returns how many px of the layout viewport the on-screen keyboard covers.
 * Updates on visualViewport resize and scroll. Returns 0 without visualViewport
 * or when enabled is false.
 */
export function useKeyboardInset(enabled: boolean = true): number {
  const [inset, setInset] = useState<number>(() => (enabled ? getKeyboardInset() : 0));

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.visualViewport) {
      setInset(0);
      return;
    }

    const vv = window.visualViewport;
    const update = () => {
      setInset(getKeyboardInset());
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [enabled]);

  return enabled ? inset : 0;
}
