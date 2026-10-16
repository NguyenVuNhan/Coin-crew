import { useId } from 'react';
import type { TripView } from '@fsl/core';
import { useT } from '../i18n';
import { useTripAction } from '../lib/useTripAction';
import { InlineError } from './InlineError';
import './FewestSwitch.css';

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
    <div className="fsl-fewest">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-describedby={explainId}
        className="fsl-fewest__switch"
        disabled={busy}
        onClick={() => run('', { fewestTransfers: !on }, 'PATCH')}
      >
        <span className={`fsl-fewest__track${on ? ' fsl-fewest__track--on' : ''}`} aria-hidden="true" />
        <span className="fsl-fewest__label">{t('fewest.title')}</span>
      </button>
      <p id={explainId} className="fsl-fewest__explain">{t('fewest.explain')}</p>
      {error ? <InlineError error={error} /> : null}
    </div>
  );
}
