import { useId, type JSX } from 'react';
import { useT } from '@cc/web-i18n';
import { Input } from '@cc/web-ui/components/ui/input';
import { Label } from '@cc/web-ui/components/ui/label';

export interface NoteFieldProps {
  value: string;
  onChange(v: string): void;
}

export function NoteField({ value, onChange }: NoteFieldProps): JSX.Element {
  const t = useT();
  const id = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-sm font-semibold text-muted-foreground px-1">
        {t('sharedExpense.note')}
      </Label>
      <Input
        id={id}
        type="text"
        data-testid="shared-note-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('sharedExpense.notePlaceholder')}
        maxLength={500}
        className="text-base"
      />
    </div>
  );
}
