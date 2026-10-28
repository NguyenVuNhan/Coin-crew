/**
 * A short status message at the bottom of the screen, above the bottom bar, with an optional action such as Undo.
 * Rendered in place (not through sonner's toast queue) because callers drive it from state and screen readers
 * need it announced as a status the moment it shows.
 */
export function Snackbar({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div
      className="fsl-snackbar pointer-events-none fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom,0px)+12px)] z-30 flex justify-center px-4 lg:bottom-6"
      role="status"
    >
      <div className="fsl-snackbar__inner pointer-events-auto flex min-h-12 w-full max-w-[448px] items-center gap-3 rounded-2xl bg-foreground py-1 pr-2 pl-4 text-base text-background shadow-lg animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none">
        <span className="fsl-snackbar__message min-w-0 flex-1 py-2 tabular-nums">{message}</span>
        {actionLabel !== undefined && onAction !== undefined && (
          <button
            type="button"
            className="fsl-snackbar__action min-h-11 min-w-11 shrink-0 cursor-pointer rounded-full px-3 font-semibold text-secondary hover:bg-background/10 focus-visible:ring-2 focus-visible:ring-secondary focus-visible:outline-none"
            onClick={onAction}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
