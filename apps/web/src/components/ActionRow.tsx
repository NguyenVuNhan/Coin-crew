import { useEffect, useState, type ReactNode } from 'react';
import { useSwipeReveal } from '../lib/useSwipeReveal';
import { useIsCoarsePointer, usePrefersReducedMotion } from '../lib/media';
import { Icon, type IconName } from './icons';
import { useT } from '../i18n';
import { cn } from '@/lib/utils';

/** Width of one revealed action button on a phone. */
const ACTION_WIDTH = 80;

export type RowAction = {
  id: string;
  label: string;
  icon: IconName;
  tone?: 'default' | 'danger' | 'success';
  onSelect: () => void;
};

const SWIPE_TONE: Record<'default' | 'danger' | 'success', string> = {
  default: 'bg-muted text-foreground',
  danger: 'bg-danger text-primary-foreground',
  success: 'bg-success text-primary-foreground',
};

const TOOL_TONE: Record<'default' | 'danger' | 'success', string> = {
  default: 'text-muted-foreground hover:bg-muted hover:text-foreground',
  danger: 'text-danger hover:bg-danger-soft',
  success: 'text-success hover:bg-success-soft',
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
      : 'transform 200ms cubic-bezier(0.2, 0, 0, 1)';

  return (
    <div className={cn('fsl-action-row group/row relative', selected && 'fsl-action-row--selected')}>
      <div
        className={cn('fsl-action-row__stage relative overflow-hidden touch-pan-y', coarse && 'select-none')}
        data-open={swipe.open}
        {...swipe.handlers}
        onPointerDown={(e) => {
          dismissHint();
          swipe.handlers.onPointerDown?.(e);
        }}
      >
        {swipeable && (
          <div
            className="fsl-action-row__swipe-actions absolute inset-y-0 right-0 flex invisible data-[revealed=true]:visible"
            data-revealed={swipe.offset > 0 || peek}
          >
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={cn(
                  'fsl-action-row__swipe-action',
                  `fsl-action-row__swipe-action--${action.tone ?? 'default'}`,
                  'w-[80px] min-h-11 border-0 m-0 flex flex-col items-center justify-center gap-1 font-sans text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  SWIPE_TONE[action.tone ?? 'default'],
                )}
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
          className={cn(
            'fsl-action-row__surface relative flex items-center will-change-transform',
            selected ? 'bg-accent' : 'bg-card hover:bg-accent',
            peek && 'fsl-action-row__surface--peek',
          )}
          style={{
            transform: `translateX(${-swipe.offset}px)`,
            ...(transition !== undefined ? { transition } : {}),
          }}
        >
          {leading && <div className="fsl-action-row__leading shrink-0 pl-4 flex items-center">{leading}</div>}
          <button
            type="button"
            className="fsl-action-row__main flex-1 min-w-0 flex items-center gap-3 px-4 py-3 min-h-11 text-left appearance-none bg-transparent border-0 m-0 font-[inherit] text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            aria-label={label}
            aria-current={selected || undefined}
            aria-expanded={expanded}
            aria-controls={controls}
            onClick={() => (swipe.open ? swipe.close() : onOpen?.())}
          >
            {children}
          </button>
          {trailing && <div className="fsl-action-row__trailing shrink-0 pr-4 flex items-center">{trailing}</div>}
          {!coarse && actions.length > 0 && (
            <div
              className={cn(
                'fsl-action-row__tools',
                'absolute top-0.5 right-0.5 bottom-0.5 min-w-[128px] flex items-center justify-end gap-1 pl-8 pr-2',
                'bg-gradient-to-r from-transparent via-card/80 to-card group-hover/row:via-accent/80 group-hover/row:to-accent group-focus-within/row:via-card/80 group-focus-within/row:to-card',
                'invisible pointer-events-none group-hover/row:visible group-hover/row:pointer-events-auto group-focus-within/row:visible group-focus-within/row:pointer-events-auto',
              )}
            >
              {actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className={cn(
                    'fsl-action-row__tool',
                    `fsl-action-row__tool--${action.tone ?? 'default'}`,
                    'size-9 inline-flex items-center justify-center rounded-lg border-0 bg-transparent p-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors',
                    TOOL_TONE[action.tone ?? 'default'],
                  )}
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
      {hint && <p className="fsl-action-row__hint m-0 px-4 pt-1 pb-2 font-sans text-xs text-muted-foreground">{t('rows.swipeHint')}</p>}
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
