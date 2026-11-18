import type { CSSProperties, JSX, ReactNode } from 'react';

export interface FoldLineProps {
  testId: string;
  label: string;
  children: ReactNode;
  onOpen(): void;
  style?: CSSProperties;
  /**
   * `default`: muted label on the left, bold truncated value on the right.
   * `action`: wrapping muted summary (`children`) on the left, non-wrapping primary action (`label`) on the right.
   */
  variant?: 'default' | 'action';
}

/**
 * One-line summary row for a folded section in the phone entry flow.
 * Tapping reopens the section in place.
 */
export function FoldLine({
  testId,
  label,
  children,
  onOpen,
  style,
  variant = 'default',
}: FoldLineProps): JSX.Element {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-expanded="false"
      onClick={onOpen}
      style={style}
      className="w-full min-h-11 px-4 py-3 rounded-xl bg-card hover:bg-accent transition-colors flex items-center justify-between gap-3 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {variant === 'action' ? (
        <>
          <span className="text-sm text-muted-foreground min-w-0">{children}</span>
          <span className="text-sm font-medium text-primary shrink-0 whitespace-nowrap">{label}</span>
        </>
      ) : (
        <>
          <span className="text-sm text-muted-foreground shrink-0">{label}</span>
          <span className="text-base font-semibold text-foreground min-w-0 truncate">{children}</span>
        </>
      )}
    </button>
  );
}
