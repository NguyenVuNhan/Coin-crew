import { Sheet } from './Sheet';
import { Icon } from './icons';
import type { RowAction } from './ActionRow';
import './ActionSheet.css';

export function ActionSheet(props: {
  open: boolean;
  onClose(): void;
  title: string;
  actions: RowAction[];
}) {
  const { open, onClose, title, actions } = props;

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="fsl-action-sheet">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={`fsl-action-sheet__action fsl-action-sheet__action--${action.tone ?? 'default'}`}
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
