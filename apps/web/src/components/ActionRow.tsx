import { useEffect, useState, type ReactNode } from 'react';
import { useSwipeReveal } from '../lib/useSwipeReveal';
import { useIsCoarsePointer, usePrefersReducedMotion } from '../lib/media';
import { Icon, type IconName } from './icons';
import { useT } from '../i18n';
import './ActionRow.css';

/** Width of one revealed action button on a phone. */
const ACTION_WIDTH = 80;

export type RowAction = {
  id: string;
  label: string;
  icon: IconName;
  tone?: 'default' | 'danger' | 'success';
  onSelect: () => void;
};

export function ActionRow({
  label,
  actions,
  onOpen,
  selected,
  expanded,
  controls,
  leading,
  trailing,
  hintable,
  children,
}: {
  label: string;
  actions: RowAction[];
  onOpen?: () => void;
  selected?: boolean;
  /** For a row that opens its content in place instead of going elsewhere: sets `aria-expanded` on the row's button. */
  expanded?: boolean;
  /** Id of the content the row opens in place, set as `aria-controls` while it is shown. */
  controls?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  hintable?: boolean;
  children: ReactNode;
}) {
  const coarse = useIsCoarsePointer();
  const reduced = usePrefersReducedMotion();
  const t = useT();

  const swipeable = coarse && actions.length > 0;
  const width = actions.length * ACTION_WIDTH;
  const swipe = useSwipeReveal({ actionsWidth: width, disabled: !swipeable });

  const [hint, setHint] = useState(() => hintable === true && swipeable && !hintSeen());

  useEffect(() => {
    if (hint) {
      markHintSeen();
    }
  }, [hint]);

  const dismissHint = () => setHint(false);

  const peek = hint && !reduced && swipe.offset === 0;

  const transition = reduced
    ? undefined
    : swipe.offset > 0 && swipe.offset < width
      ? 'none'
      : 'transform var(--motion-base) var(--ease-out)';

  return (
    <div className={`fsl-action-row${selected ? ' fsl-action-row--selected' : ''}`}>
      <div
        className="fsl-action-row__stage"
        data-open={swipe.open}
        {...swipe.handlers}
        onPointerDown={(e) => {
          dismissHint();
          swipe.handlers.onPointerDown?.(e);
        }}
      >
        {swipeable && (
          <div className="fsl-action-row__swipe-actions" data-revealed={swipe.offset > 0 || peek}>
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={`fsl-action-row__swipe-action fsl-action-row__swipe-action--${action.tone ?? 'default'}`}
                onClick={() => {
                  swipe.close();
                  action.onSelect();
                }}
              >
                <Icon name={action.icon} size={20} />
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        )}
        <div
          className={`fsl-action-row__surface${peek ? ' fsl-action-row__surface--peek' : ''}`}
          style={{
            transform: `translateX(${-swipe.offset}px)`,
            ...(transition !== undefined ? { transition } : {}),
          }}
        >
          {leading && <div className="fsl-action-row__leading">{leading}</div>}
          <button
            type="button"
            className="fsl-action-row__main"
            aria-label={label}
            aria-current={selected || undefined}
            aria-expanded={expanded}
            aria-controls={controls}
            onClick={() => (swipe.open ? swipe.close() : onOpen?.())}
          >
            {children}
          </button>
          {trailing && <div className="fsl-action-row__trailing">{trailing}</div>}
          {!coarse && actions.length > 0 && (
            <div className="fsl-action-row__tools">
              {actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className={`fsl-action-row__tool fsl-action-row__tool--${action.tone ?? 'default'}`}
                  aria-label={action.label}
                  title={action.label}
                  onClick={action.onSelect}
                >
                  <Icon name={action.icon} size={18} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {hint && <p className="fsl-action-row__hint">{t('rows.swipeHint')}</p>}
    </div>
  );
}

function hintSeen(): boolean {
  try {
    return localStorage.getItem('fsl.swipeHintSeen') !== null;
  } catch {
    return false;
  }
}

function markHintSeen(): void {
  try {
    localStorage.setItem('fsl.swipeHintSeen', '1');
  } catch {
    // storage blocked: the hint may show again, that is fine
  }
}
