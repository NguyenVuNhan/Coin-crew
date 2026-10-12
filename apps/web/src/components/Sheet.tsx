import {
  type ReactNode,
  useId,
  useEffect,
  useRef,
} from 'react';
import { useT } from '../i18n';
import './Sheet.css';

export interface SheetProps {
  open: boolean;
  onClose?: () => void;
  title: string;
  children: ReactNode;
  className?: string;
  dismissible?: boolean;
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  className = '',
  dismissible = true,
}: SheetProps) {
  const t = useT();
  const titleId = useId();
  const openerRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const canDismiss = dismissible && typeof onClose === 'function';

  useEffect(() => {
    if (open) {
      openerRef.current = document.activeElement as HTMLElement | null;
      const timer = setTimeout(() => {
        dialogRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    } else {
      if (openerRef.current) {
        openerRef.current.focus();
        openerRef.current = null;
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open || !canDismiss || !onClose) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, canDismiss, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fsl-sheet-overlay"
      onClick={canDismiss ? onClose : undefined}
      aria-hidden="false"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`fsl-sheet ${className}`.trim()}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="fsl-sheet__header">
          <h2 id={titleId} className="fsl-sheet__title">
            {title}
          </h2>
          {canDismiss && onClose && (
            <button
              type="button"
              className="fsl-sheet__close"
              onClick={onClose}
              aria-label={t('common.close')}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </header>
        <div className="fsl-sheet__content">{children}</div>
      </div>
    </div>
  );
}
