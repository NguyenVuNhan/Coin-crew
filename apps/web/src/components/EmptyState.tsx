import type { ReactNode } from 'react';
import './EmptyState.css';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  action: ReactNode;
  className?: string;
}

const DefaultIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

export function EmptyState({
  icon,
  title,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`fsl-empty-state ${className}`.trim()}>
      <div className="fsl-empty-state__header">
        <span className="fsl-empty-state__icon">
          {icon ?? <DefaultIcon />}
        </span>
        <p className="fsl-empty-state__title">{title}</p>
      </div>
      <div className="fsl-empty-state__action">{action}</div>
    </div>
  );
}
