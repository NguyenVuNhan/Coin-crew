import type { JSX } from 'react';
import { useT } from '@cc/web-i18n';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';

export interface NoMatchProps {
  onClear(): void;
}

/** Quiet empty-result block shown when active filters match no transactions. */
export function NoMatch({ onClear }: NoMatchProps): JSX.Element {
  const t = useT();

  return (
    <div
      data-testid="tx-no-match"
      className="py-8 px-4 flex flex-col items-center gap-3 text-center"
    >
      <Icon
        name="searchX"
        size={20}
        className="text-muted-foreground"
        aria-hidden="true"
      />
      <p className="m-0 text-sm text-muted-foreground">
        {t('transactions.noMatch')}
      </p>
      <Button
        type="button"
        variant="secondary"
        data-testid="tx-clear-filters"
        onClick={onClear}
      >
        {t('transactions.clearFilters')}
      </Button>
    </div>
  );
}
