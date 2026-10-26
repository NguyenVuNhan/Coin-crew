import type { JSX } from 'react';
import type { PersonView } from '@fsl/core';
import { useT } from '../i18n';
import { Avatar } from './Avatar';
import './SplitBetween.css';

export interface SplitBetweenProps {
  people: readonly PersonView[];
  chosen: ReadonlySet<string>;
  me: string | null;
  onOpen(): void;
}

/** The line above the split picker that says who the bill is split between; tapping it opens the sheet. */
export function SplitBetween({ people, chosen, me, onOpen }: SplitBetweenProps): JSX.Element {
  const t = useT();
  const inGroup = people.filter((p) => chosen.has(p.id));
  const n = inGroup.length;
  const total = people.length;
  const names = inGroup.map((p) => (p.id === me ? t('splitBetween.you') : p.name)).join(', ');
  const label = n > 0 && n === total ? t('splitBetween.everyone', { n }) : t('splitBetween.label', { n, total });

  return (
    <div className="fsl-split-between">
      <button
        type="button"
        className="fsl-split-between__button"
        aria-label={t('splitBetween.aria', { label, names: names || t('splitBetween.none') })}
        onClick={onOpen}
      >
        <span className="fsl-split-between__avatars" aria-hidden="true">
          {inGroup.slice(0, 3).map((p) => (
            <Avatar key={p.id} name={p.name} avatarUrl={p.avatarUrl} size="sm" />
          ))}
        </span>
        <span className="fsl-split-between__text">
          <span className="fsl-split-between__label">{label}</span>
          <span className="fsl-split-between__names">{n > 0 ? names : t('splitBetween.none')}</span>
        </span>
        <span className="fsl-split-between__change" aria-hidden="true">
          {t('splitBetween.change')}
        </span>
      </button>
      {n === 0 && (
        <p role="alert" className="fsl-split-between__error">
          {t('splitError.NO_PARTICIPANTS')}
        </p>
      )}
    </div>
  );
}
