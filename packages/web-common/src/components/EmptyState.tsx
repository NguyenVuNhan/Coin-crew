import type { ReactNode } from 'react';
import { Icon, type IconName } from './icons';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  /** One line under the title. */
  body?: string;
  action: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <Card
      className={cn(
        'fsl-empty-state rounded-xl bg-card p-5 border border-border shadow-none ring-0 flex flex-col items-start gap-4 text-left w-full text-card-foreground',
        className,
      )}
    >
      <div className="fsl-empty-state__header flex items-start gap-3 w-full">
        {icon && (
          <span className="fsl-empty-state__icon size-12 rounded-2xl bg-secondary text-secondary-foreground flex items-center justify-center shrink-0">
            <Icon name={icon} size={24} />
          </span>
        )}
        <div className="fsl-empty-state__text flex flex-col gap-1 min-w-0">
          <p className="fsl-empty-state__title m-0 text-base font-semibold text-foreground">{title}</p>
          {body && <p className="fsl-empty-state__body m-0 text-sm text-muted-foreground">{body}</p>}
        </div>
      </div>
      <div className="fsl-empty-state__action self-stretch flex flex-col gap-2">{action}</div>
    </Card>
  );
}
