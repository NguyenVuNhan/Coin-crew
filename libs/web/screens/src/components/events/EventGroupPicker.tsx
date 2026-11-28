import { useId, useMemo, type JSX } from 'react';
import { useT } from '@cc/web-i18n';
import { useMyGroups } from '@cc/web-data-access/groups';
import { Button } from '@cc/web-ui/components/Button';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { Checkbox } from '@cc/web-ui/components/ui/checkbox';
import { Label } from '@cc/web-ui/components/ui/label';

export interface EventGroupPickerProps {
  open: boolean;
  onClose: () => void;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function EventGroupPicker({
  open,
  onClose,
  selectedIds,
  onChange,
}: EventGroupPickerProps): JSX.Element {
  const t = useT();
  const groupIdPrefix = useId();
  const groupsQuery = useMyGroups({ enabled: open });

  const groups = useMemo(
    () => (groupsQuery.data?.items ?? []).filter((g) => g.preset !== 'direct'),
    [groupsQuery.data?.items],
  );

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const handleToggle = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    onChange(Array.from(next));
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('events.groupsLabel')}>
      <div className="fsl-event-group-picker flex flex-col gap-4" data-testid="event-group-picker">
        {groupsQuery.isPending && groups.length === 0 ? (
          <SkeletonList rows={3} />
        ) : groupsQuery.error && groups.length === 0 ? (
          <InlineError error={groupsQuery.error} onRetry={() => groupsQuery.refetch()} />
        ) : groups.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">{t('events.groupsHint')}</p>
        ) : (
          <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
            {groups.map((g) => {
              const checkboxId = `${groupIdPrefix}-${g.id}`;
              const checked = selectedSet.has(g.id);
              return (
                <Label
                  key={g.id}
                  htmlFor={checkboxId}
                  data-testid={`event-group-row-${g.id}`}
                  className="min-h-11 px-3.5 py-2.5 flex items-center gap-3 font-normal cursor-pointer hover:bg-muted transition-colors motion-reduce:transition-none"
                >
                  <Checkbox
                    id={checkboxId}
                    data-testid={`event-group-check-${g.id}`}
                    checked={checked}
                    onCheckedChange={(next) => handleToggle(g.id, next === true)}
                  />
                  <span className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">
                    {g.name}
                  </span>
                </Label>
              );
            })}
          </div>
        )}

        <Button
          type="button"
          variant="primary"
          block
          data-testid="event-group-picker-done"
          onClick={onClose}
        >
          {t('common.close')}
        </Button>
      </div>
    </Sheet>
  );
}
