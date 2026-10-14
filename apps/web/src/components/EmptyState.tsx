import type { ReactNode } from 'react';
import { Icon, type IconName } from './icons';
import './EmptyState.css';

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  action: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`fsl-empty-state ${className}`.trim()}>
      <div className="fsl-empty-state__header">
        {icon && (
          <span className="fsl-empty-state__icon">
            <Icon name={icon} size={20} />
          </span>
        )}
        <p className="fsl-empty-state__title">{title}</p>
      </div>
      <div className="fsl-empty-state__action">{action}</div>
    </div>
  );
}
