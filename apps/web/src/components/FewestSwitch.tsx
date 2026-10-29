import { useId } from 'react';
import type { TripView } from '@fsl/core';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useT } from '../i18n';
import { useTripAction } from '../lib/useTripAction';
import { InlineError } from './InlineError';

/**
 * The "Fewest transfers" switch with its explanation. Moved off the trip page unchanged;
 * trip Settings shows it (spec §5.4, §8.6).
 */
export function FewestSwitch({ view }: { view: TripView }) {
  const t = useT();
  const switchId = useId();
  const explainId = useId();
  const { busy, error, run } = useTripAction(view.trip.id);
  const on = view.trip.fewestTransfers;
  return (
    <div className="fsl-fewest flex flex-col gap-1 p-4 bg-card rounded-xl border border-border">
      <div className="flex items-center justify-between gap-3 min-h-11">
        <Label htmlFor={switchId} className="fsl-fewest__label font-semibold text-foreground text-base leading-snug flex-1">
          {t('fewest.title')}
        </Label>
        <Switch
          id={switchId}
          checked={on}
          onCheckedChange={() => run('', { fewestTransfers: !on }, 'PATCH')}
          disabled={busy}
          aria-describedby={explainId}
          className="fsl-fewest__switch"
        />
      </div>
      <p id={explainId} className="fsl-fewest__explain m-0 text-sm text-muted-foreground">{t('fewest.explain')}</p>
      {error ? <InlineError error={error} /> : null}
    </div>
  );
}
