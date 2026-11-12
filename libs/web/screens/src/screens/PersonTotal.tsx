import type { JSX } from 'react';
import { useT } from '@cc/web-i18n';
import { Amount } from '@cc/web-ui/components/Amount';

/** The person screen's hero: "Owes you" / "You owe" with the amount, or "All settled". */
export function PersonTotal({ total }: { total: number }): JSX.Element {
  const t = useT();
  return (
    <div className="fsl-person__total flex flex-col items-center gap-1 text-center py-2">
      {total > 0 ? (
        <>
          <span className="text-sm font-medium text-muted-foreground">{t('person.owesYou')}</span>
          <Amount value={total} tone="success" size="xl" />
        </>
      ) : total < 0 ? (
        <>
          <span className="text-sm font-medium text-muted-foreground">{t('person.youOwe')}</span>
          <Amount value={-total} tone="danger" size="xl" />
        </>
      ) : (
        <span className="text-base font-semibold text-muted-foreground">{t('person.settled')}</span>
      )}
    </div>
  );
}
