import { cn } from '@/lib/utils';
import { Sheet } from './Sheet';
import { Icon } from './icons';
import type { RowAction } from './ActionRow';

export function ActionSheet(props: {
  open: boolean;
  onClose(): void;
  title: string;
  actions: RowAction[];
}) {
  const { open, onClose, title, actions } = props;

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className={cn('fsl-action-sheet bg-card rounded-xl border border-border divide-y divide-border overflow-hidden')}>
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={cn(
              'fsl-action-sheet__action',
              `fsl-action-sheet__action--${action.tone ?? 'default'}`,
              'flex items-center gap-3 w-full min-h-12 px-4 py-3 text-left font-medium text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none cursor-pointer',
              action.tone === 'danger' && 'text-danger hover:bg-danger-soft',
              action.tone === 'success' && 'text-success hover:bg-success-soft',
              (!action.tone || action.tone === 'default') && 'text-foreground hover:bg-muted',
            )}
            onClick={() => {
              onClose();
              action.onSelect();
            }}
          >
            <Icon name={action.icon} size={20} />
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

