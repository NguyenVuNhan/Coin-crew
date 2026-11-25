import type { JSX } from 'react';
import { useT } from '@cc/web-i18n';
import { Avatar } from '@cc/web-ui/components/Avatar';
import { Icon } from '@cc/web-ui/components/icons';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { cn } from '@cc/web-ui/lib/utils';

export interface PayerSheetProps {
  open: boolean;
  onClose(): void;
  people: { id: string; name: string }[];
  me: string | null;
  value: string;
  onChange(id: string): void;
}

export function PayerSheet({
  open,
  onClose,
  people,
  me,
  value,
  onChange,
}: PayerSheetProps): JSX.Element {
  const t = useT();

  const handleSelect = (id: string) => {
    onChange(id);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('sharedExpense.payer')}>
      <div data-testid="payer-sheet-list" className="flex flex-col divide-y divide-border">
        {people.map((person) => {
          const isMe = me !== null && person.id === me;
          const selected = person.id === value;
          const label = isMe ? t('expenseForm.me', { name: person.name }) : person.name;
          return (
            <button
              key={person.id}
              type="button"
              data-testid={`payer-option-${person.id}`}
              aria-pressed={selected}
              onClick={() => handleSelect(person.id)}
              className={cn(
                'min-h-11 w-full flex items-center gap-3 px-2 py-2 text-left text-base text-foreground hover:bg-muted rounded-xl cursor-pointer bg-transparent border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected && 'text-primary font-semibold',
              )}
            >
              <Avatar name={person.name} size="sm" />
              <span className="flex-1 truncate">{label}</span>
              {selected && <Icon name="check" size={18} className="text-primary shrink-0" />}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
