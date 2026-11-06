import { useId } from 'react';
import type { TripView } from '@cc/core';
import { Label } from '@cc/web-ui/components/ui/label';
import { Switch } from '@cc/web-ui/components/ui/switch';
import { useT } from '@cc/web-i18n';
import { useTripAction } from '../lib/useTripAction';
import { InlineError } from '@cc/web-ui/components/InlineError';

export function RoundTransfersSwitch({ view }: { view: TripView }) {
  const t = useT();
  const switchId = useId();
  const explainId = useId();
  const { busy, error, run } = useTripAction(view.trip.id);
  const on = Boolean(view.trip.roundTransfers);
  return (
    <div className="fsl-round-transfers flex flex-col gap-1 p-4 bg-card rounded-xl border border-border">
      <div className="flex items-center justify-between gap-3 min-h-11">
        <Label htmlFor={switchId} className="fsl-round-transfers__label font-semibold text-foreground text-base leading-snug flex-1">
          {t('roundTransfers.title')}
        </Label>
        <Switch
          id={switchId}
          checked={on}
          onCheckedChange={() => run('', { roundTransfers: !on }, 'PATCH')}
          disabled={busy}
          aria-describedby={explainId}
          className="fsl-round-transfers__switch"
        />
      </div>
      <p id={explainId} className="fsl-round-transfers__explain m-0 text-sm text-muted-foreground">{t('roundTransfers.explain')}</p>
      {error ? <InlineError error={error} /> : null}
    </div>
  );
}
