import { useId } from 'react';
import type { TripView } from '@fsl/core';
import { cn } from '@/lib/utils';
import { useT } from '../i18n';
import { useTripAction } from '../lib/useTripAction';
import { InlineError } from './InlineError';

/**
 * The "Fewest transfers" switch with its explanation. Moved off the trip page unchanged;
 * trip Settings shows it (spec §5.4, §8.6).
 */
export function FewestSwitch({ view }: { view: TripView }) {
  const t = useT();
  const explainId = useId();
  const { busy, error, run } = useTripAction(view.trip.id);
  const on = view.trip.fewestTransfers;
  return (
    <div className={cn('fsl-fewest flex flex-col gap-1 p-4 bg-card rounded-xl border border-border')}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-describedby={explainId}
        className={cn(
          'fsl-fewest__switch flex items-center justify-between gap-3 min-h-11 w-full text-left cursor-pointer select-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg',
        )}
        disabled={busy}
        onClick={() => run('', { fewestTransfers: !on }, 'PATCH')}
      >
        <span className="fsl-fewest__label font-semibold text-foreground">{t('fewest.title')}</span>
        <span
          className={cn(
            'fsl-fewest__track relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors motion-reduce:transition-none',
            on ? 'fsl-fewest__track--on bg-primary' : 'bg-input',
          )}
          aria-hidden="true"
        >
          <span
            className={cn(
              'pointer-events-none block size-5 rounded-full bg-card shadow-xs ring-0 transition-transform motion-reduce:transition-none',
              on ? 'translate-x-[22px]' : 'translate-x-0.5',
            )}
          />
        </span>
      </button>
      <p id={explainId} className="fsl-fewest__explain m-0 text-sm text-muted-foreground">{t('fewest.explain')}</p>
      {error ? <InlineError error={error} /> : null}
    </div>
  );
}
