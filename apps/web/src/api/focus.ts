import { focusManager } from '@tanstack/react-query';

/**
 * Refetches stale queries when the window comes back into focus, not only when the tab becomes visible again.
 * With two windows side by side (two accounts testing one group, say), switching between them never hides
 * either tab, so a change made in one would not show in the other. Returns a function that undoes it.
 */
export function refetchOnWindowFocus(): () => void {
  focusManager.setEventListener((handleFocus) => {
    const onChange = () => handleFocus();
    window.addEventListener('visibilitychange', onChange, false);
    window.addEventListener('focus', onChange, false);
    return () => {
      window.removeEventListener('visibilitychange', onChange);
      window.removeEventListener('focus', onChange);
    };
  });
  return () => focusManager.setEventListener((handleFocus) => {
    const onVisibility = () => handleFocus();
    window.addEventListener('visibilitychange', onVisibility, false);
    return () => window.removeEventListener('visibilitychange', onVisibility);
  });
}
