import './Snackbar.css';

/** A short status message at the bottom of the screen, above the bottom bar, with an optional action such as Undo. */
export function Snackbar({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="fsl-snackbar" role="status">
      <div className="fsl-snackbar__inner">
        <span className="fsl-snackbar__message">{message}</span>
        {actionLabel !== undefined && onAction !== undefined && (
          <button type="button" className="fsl-snackbar__action" onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
