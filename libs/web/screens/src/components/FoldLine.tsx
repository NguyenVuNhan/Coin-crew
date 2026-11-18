import type { JSX, ReactNode } from 'react';

export interface FoldLineProps {
  testId: string;
  label: string;
  children: ReactNode;
  onOpen(): void;
}

/**
 * One-line summary row for a folded section in the phone entry flow.
 * Tapping reopens the section in place.
 */
export function FoldLine({ testId, label, children, onOpen }: FoldLineProps): JSX.Element {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-expanded="false"
      onClick={onOpen}
      className="w-full min-h-11 px-4 py-3 rounded-xl bg-card hover:bg-accent transition-colors flex items-center justify-between gap-3 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-base font-semibold text-foreground min-w-0 truncate">{children}</span>
    </button>
  );
}
