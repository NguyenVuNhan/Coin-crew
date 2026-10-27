import { useId } from 'react';
import type { TripView } from '@fsl/core';
import { useT } from '../i18n';
import { useTripAction } from '../lib/useTripAction';
import { InlineError } from './InlineError';
import './FewestSwitch.css';

/**
 * The "Player ratings" switch with its explanation in sport group Settings (admins only).
 */
export function RatingsSwitch({ view }: { view: TripView }) {
  const t = useT();
  const explainId = useId();
  const { busy, error, run } = useTripAction(view.trip.id);
  const on = Boolean(view.ratings?.enabled ?? view.trip.ratingsEnabled);
  return (
    <div className="fsl-fewest">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-describedby={explainId}
        className="fsl-fewest__switch"
        disabled={busy}
        onClick={() => run('', { ratingsEnabled: !on }, 'PATCH')}
      >
        <span className={`fsl-fewest__track${on ? ' fsl-fewest__track--on' : ''}`} aria-hidden="true" />
        <span className="fsl-fewest__label">{t('ratings.switchTitle')}</span>
      </button>
      <p id={explainId} className="fsl-fewest__explain">{t('ratings.switchExplain')}</p>
      {error ? <InlineError error={error} /> : null}
    </div>
  );
}
