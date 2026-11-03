import { useT } from '../i18n';
import type { ListMode } from '../lib/useListMode';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/** The "Show all" / "Show mine" chip next to a section title; same look as the one in Your transfers. */
export function ListModeChip({ mode, onToggle }: { mode: ListMode; onToggle(): void }) {
  const t = useT();
  return (
    <button
      type="button"
      className={cn(
        'fsl-list-chip group inline-flex min-h-11 min-w-11 items-center justify-end pl-2 m-0 border-0 bg-transparent cursor-pointer font-inherit text-foreground focus-visible:outline-none',
      )}
      onClick={onToggle}
    >
      <Badge
        variant="outline"
        className={cn(
          'fsl-list-chip__pill inline-flex min-h-7 items-center rounded-full border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors group-hover:bg-muted group-focus-visible:ring-2 group-focus-visible:ring-ring',
        )}
      >
        {mode === 'mine' ? t('transfers.showAll') : t('transfers.showMine')}
      </Badge>
    </button>
  );
}
